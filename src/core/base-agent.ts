import type { z } from "zod";
import { complete, completeJSON, type ModelTier, type CompleteOpts } from "./llm.js";
import type { SharedContext } from "./context.js";
import type { AgentName, AgentResult, Task } from "./types.js";

/**
 * Base class every agent extends. It centralizes:
 *   - identity (name) + which model tier the agent runs on
 *   - the system prompt that defines the agent's role
 *   - helpers to call the LLM (think / thinkJSON) with the agent's persona
 *
 * Subclasses implement handle() — the actual work for a task. The orchestrator
 * calls run(), which wraps handle() with logging.
 */
export abstract class BaseAgent {
  abstract readonly name: AgentName;
  abstract readonly title: string;
  abstract readonly tier: ModelTier;
  abstract readonly systemPrompt: string;

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

  /** Free-form LLM call using this agent's persona + tier. */
  protected think(prompt: string, opts: CompleteOpts = {}): Promise<string> {
    return complete(prompt, { tier: this.tier, system: this.systemPrompt, ...opts });
  }

  /** Structured LLM call validated against a schema, using this agent's persona. */
  protected thinkJSON<S extends z.ZodTypeAny>(
    prompt: string,
    schema: S,
    opts: CompleteOpts = {}
  ): Promise<z.infer<S>> {
    return completeJSON(prompt, schema, { tier: this.tier, system: this.systemPrompt, ...opts });
  }
}
