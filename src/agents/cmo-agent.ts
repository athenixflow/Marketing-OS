import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, NewTask, Task } from "../core/types.js";

/** A planned task carries a short reference name so deps can be wired by name. */
export interface PlannedTask extends NewTask {
  _ref: string;
}
import type { ModelTier } from "../core/llm.js";
import type {
  BrandData,
  AudienceData,
  CompetitorData,
  StrategyData,
  ContentCalendarData,
} from "../memory/schema.js";

/**
 * The master agent. Two responsibilities:
 *   1. plan(): decompose a goal into an ordered, dependency-aware task list for
 *      the orchestrator (deterministic full-funnel pipeline).
 *   2. handle(): after every task completes, synthesize an executive summary.
 */
export class CmoAgent extends BaseAgent {
  readonly name: AgentName = "cmo";
  readonly title = "CMO Agent";
  // Planning is deterministic and the synthesis is a single summary pass — Sonnet
  // is plenty. Opus stays on the rigor-critical agents (strategy/financials/QA).
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the CMO Agent — the head of an AI marketing department. You coordinate " +
    "specialist agents and synthesize their work into clear executive direction.";

  /**
   * Build the standard end-to-end marketing pipeline. Dependencies encode the
   * natural order: research → strategy → content/creative → audit, all feeding
   * the CMO synthesis at the end.
   */
  plan(url: string | undefined): PlannedTask[] {
    const tasks: Array<NewTask & { _ref: string }> = [
      { _ref: "brand", type: "brand.analyze", goal: "Analyze the website and build the brand profile", assignedAgent: "brand-intelligence", priority: 10, input: { url } },
      { _ref: "market", type: "market.research", goal: "Size the market and gather benchmarks (web-sourced)", assignedAgent: "market-research", priority: 20 },
      { _ref: "competitors", type: "competitor.discover", goal: "Map the competitive landscape (web-sourced)", assignedAgent: "competitor-research", priority: 20 },
      { _ref: "audience", type: "audience.research", goal: "Define audience segments and personas (web-sourced)", assignedAgent: "audience-research", priority: 20 },
      { _ref: "strategy", type: "strategy.build", goal: "Build the 30/60/90-day marketing strategy", assignedAgent: "marketing-strategy", priority: 30, qa: true },
      { _ref: "financials", type: "finance.model", goal: "Build the unit-economics & budget model", assignedAgent: "financial", priority: 35, qa: true },
      { _ref: "funnel", type: "funnel.design", goal: "Design the full-funnel customer journey", assignedAgent: "funnel-strategy", priority: 40 },
      { _ref: "seo", type: "seo.strategy", goal: "Build the SEO strategy (web-sourced)", assignedAgent: "seo-strategy", priority: 40 },
      { _ref: "research", type: "content.research", goal: "Research content trends and topics (web-sourced)", assignedAgent: "content-research", priority: 40 },
      { _ref: "content", type: "content.calendar", goal: "Create content pillars and calendar", assignedAgent: "content-creation", priority: 50 },
      { _ref: "copy", type: "copy.write", goal: "Write sample captions, a script, and a blog post", assignedAgent: "copywriting", priority: 60 },
      { _ref: "creative", type: "creative.develop", goal: "Develop the creative platform", assignedAgent: "creative-director", priority: 50 },
      { _ref: "image", type: "image.prompts", goal: "Produce ready-to-use image prompts", assignedAgent: "image-generation", priority: 60 },
      { _ref: "cro", type: "cro.audit", goal: "Audit the website for conversion blockers", assignedAgent: "cro", priority: 30, input: { url } },
      { _ref: "analytics", type: "analytics.plan", goal: "Define the measurement and KPI framework", assignedAgent: "analytics", priority: 55 },
      { _ref: "qa", type: "qa.consistency", goal: "Cross-deliverable consistency review", assignedAgent: "qa", priority: 70 },
      { _ref: "report", type: "report.build", goal: "Compile the board-ready strategy report", assignedAgent: "report-builder", priority: 80 },
    ];

    // Wire dependencies by reference name, then strip the helper field.
    const deps: Record<string, string[]> = {
      market: ["brand"],
      competitors: ["brand"],
      audience: ["brand"],
      strategy: ["brand", "market", "competitors", "audience"],
      financials: ["strategy", "market"],
      funnel: ["strategy"],
      seo: ["strategy"],
      research: ["audience"],
      content: ["strategy", "research"],
      copy: ["content"],
      creative: ["strategy", "audience"],
      image: ["creative"],
      analytics: ["strategy", "financials"],
      cro: ["brand"],
      qa: ["strategy", "financials", "content", "creative", "analytics"],
      report: ["strategy", "financials", "market", "audience", "competitors", "content", "creative", "cro", "analytics", "qa"],
    };

    // Map _ref -> task index is implicit; orchestrator resolves real ids after add.
    // We return ref-based deps; the orchestrator translates them on enqueue.
    return tasks.map((t) => ({
      ...t,
      dependsOn: deps[t._ref]?.map((r) => `@${r}`) ?? [],
    }));
  }

  /** Synthesize an executive summary from everything in memory. */
  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, competitors, strategy, calendar] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<CompetitorData>("competitors"),
      ctx.memory.get<StrategyData>("strategy"),
      ctx.memory.get<ContentCalendarData>("content-calendar"),
    ]);

    const summary = await this.think(
      `Write a concise executive summary (Markdown) for the marketing plan of ${brand.name}.

GOAL: ${ctx.goal}
POSITIONING: ${strategy.positioning ?? "n/a"}
GROWTH STRATEGY: ${strategy.growthStrategy ?? "n/a"}
AUDIENCE: ${audience.segments.map((s) => s.name).join(", ") || "n/a"}
COMPETITORS: ${competitors.competitors.map((c) => c.name).join(", ") || "n/a"}
CHANNELS: ${(strategy.channels ?? []).map((c) => c.channel).join(", ") || "n/a"}
CONTENT PILLARS: ${calendar.pillars.map((p) => p.name).join(", ") || "n/a"}
KPIS: ${(strategy.kpis ?? []).map((k) => `${k.metric} → ${k.target}`).join("; ") || "n/a"}

Structure: ## Situation, ## Strategy, ## 30/60/90 Roadmap, ## Channels & Content,
## How We'll Measure Success. Be specific and decisive — this is the CMO's directive.`,
      { temperature: 0.5, maxTokens: 3000 }
    );

    const file = await ctx.memory.recordAsset("executive-summary.md", summary);
    return { output: { file }, summary: `Synthesized executive summary → ${file}` };
  }
}
