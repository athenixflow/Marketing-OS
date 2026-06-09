import type { z } from "zod";
import {
  complete,
  completeJSON,
  critique,
  research,
  type ModelTier,
  type CompleteOpts,
  type Source,
} from "./llm.js";
import type { SharedContext } from "./context.js";
import type { AgentName, AgentResult, Task } from "./types.js";

/**
 * Base class every agent extends. It centralizes:
 *   - identity (name) + which model tier the agent runs on
 *   - the system prompt + quality rubric that define the agent's standard
 *   - institutional-grade LLM helpers: deepThinkJSON (draft → critique → revise),
 *     researchJSON (web-grounded + cited), plus light think/thinkJSON.
 *
 * Subclasses implement handle(). The orchestrator calls run(), which logs and can
 * inject QA revision notes (see ctx-carried revision notes on the task).
 */

/** Default institutional rubric; agents may override with role-specific criteria. */
const DEFAULT_RUBRIC = `- Specific and decisive — no generic platitudes or filler.
- Every quantitative claim is either sourced or labeled as a stated assumption.
- Reasoning is explicit; recommendations are prioritized and actionable.
- Tailored to THIS brand, market, and audience — not boilerplate.
- Internally consistent; would survive scrutiny in a partner/board review.`;

export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly title: string;
  abstract readonly tier: ModelTier;
  abstract readonly systemPrompt: string;

  /** Quality bar this agent self-critiques against. Override per role. */
  readonly rubric: string = DEFAULT_RUBRIC;
  /** Set true for agents that should gather real web evidence. */
  readonly grounded: boolean = false;

  /** Do the work. Subclasses must implement. */
  protected abstract handle(task: Task, ctx: SharedContext): Promise<AgentResult>;

  /** Orchestrator entry point — logs start/finish around handle(). */
  async run(task: Task, ctx: SharedContext): Promise<AgentResult> {
    await ctx.memory.log({
      level: "info",
      scope: this.name,
      message: `Starting: ${task.goal}`,
      data: { taskId: task.id, type: task.type },
    });

    const result = await this.handle(task, ctx);

    await ctx.memory.log({
      level: "info",
      scope: this.name,
      message: `Done: ${result.summary}`,
      data: { taskId: task.id },
    });
    return result;
  }

  // ---- Light helpers --------------------------------------------------------

  /** Free-form LLM call using this agent's persona + tier. */
  protected think(prompt: string, opts: CompleteOpts = {}): Promise<string> {
    return complete(prompt, { tier: this.tier, system: this.systemPrompt, ...opts });
  }

  /** Single-pass structured call (use deepThinkJSON for deliverables). */
  protected thinkJSON<S extends z.ZodTypeAny>(
    prompt: string,
    schema: S,
    opts: CompleteOpts = {}
  ): Promise<z.infer<S>> {
    return completeJSON(prompt, schema, { tier: this.tier, system: this.systemPrompt, ...opts });
  }

  // ---- Institutional helpers ------------------------------------------------

  /**
   * Draft → self-critique (against this agent's rubric) → revise → validated JSON.
   * A QA reviewer's notes (from a prior gated attempt) can be appended via opts.
   */
  protected async deepThinkJSON<S extends z.ZodTypeAny>(
    prompt: string,
    schema: S,
    opts: CompleteOpts & { revisionNotes?: string } = {}
  ): Promise<z.infer<S>> {
    const sys = { tier: this.tier, system: this.systemPrompt, ...opts } as CompleteOpts;

    // 1) Draft (free-form so the critique step sees full reasoning).
    const draftPrompt = opts.revisionNotes
      ? `${prompt}\n\nA prior version was rejected in review. Address these notes fully:\n${opts.revisionNotes}`
      : prompt;
    const draft = await complete(draftPrompt, sys);

    // 2) Critique against the rubric.
    const notes = await critique(draft, this.rubric, { tier: this.tier });

    // 3) Revise and structure to schema.
    return completeJSON(
      `${prompt}

You produced this DRAFT:
${draft}

A reviewer raised these REQUIRED FIXES:
${notes}

Produce the final, improved version that resolves every fix. Return it as JSON.`,
      schema,
      sys
    );
  }

  /**
   * Web-grounded deliverable: research real evidence, then structure it (with
   * the gathered sources) into schema. Falls back to deepThinkJSON if grounding
   * is unavailable. The schema SHOULD include a `sources` array + `confidence`.
   */
  protected async researchJSON<S extends z.ZodTypeAny>(
    researchPrompt: string,
    structurePrompt: string,
    schema: S,
    opts: CompleteOpts = {}
  ): Promise<{ data: z.infer<S>; sources: Source[]; grounded: boolean }> {
    const r = await research(researchPrompt, { tier: this.tier, system: this.systemPrompt });
    const data = await this.deepThinkJSON(
      `${structurePrompt}

RESEARCH FINDINGS (ground every claim in this; cite the sources provided):
${r.text}

AVAILABLE SOURCES (use these for the "sources" field, verbatim):
${r.sources.map((s) => `- ${s.title} | ${s.url}`).join("\n") || "(no web sources retrieved — mark confidence lower and rely on disclosed assumptions)"}`,
      schema,
      opts
    );
    return { data, sources: r.sources, grounded: r.grounded };
  }
}
