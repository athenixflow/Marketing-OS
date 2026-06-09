import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { strategySchema, strategyPrompt, toStrategyData } from "../engines/strategy/strategy-engine.js";
import type { BrandData, AudienceData, CompetitorData, MarketData } from "../memory/schema.js";

/** Produces the master 30/60/90 strategy: positioning, channels, KPIs, risks. */
export class MarketingStrategyAgent extends BaseAgent {
  readonly name: AgentName = "marketing-strategy";
  readonly title = "Marketing Strategy Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are a seasoned CMO and growth strategist. You synthesize brand, market, audience, " +
    "and competitor intelligence into a sharp, sequenced, defensible 90-day strategy.";
  readonly rubric =
    `- Positioning is sharp, ownable, and consistent with the competitive gap.\n` +
    `- KPI targets are anchored to the provided market benchmarks, not invented.\n` +
    `- 30/60/90 phases are sequenced and causally linked (each builds on the last).\n` +
    `- Channel choices are justified and matched to the audience.\n` +
    `- Risk register names real risks with credible mitigations; assumptions are explicit.`;

  protected async handle(task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, competitors, market] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<CompetitorData>("competitors"),
      ctx.memory.get<MarketData>("market"),
    ]);

    const generated = await this.deepThinkJSON(
      strategyPrompt({ brand, audience, competitors, market, goal: ctx.goal }),
      strategySchema,
      { temperature: 0.4, maxTokens: 7000, revisionNotes: task.input?.revisionNotes as string | undefined }
    );

    const data = toStrategyData(generated);
    await ctx.memory.merge("strategy", data);
    ctx.set("strategy", data);

    return {
      output: data,
      summary: `Positioning + 30/60/90, ${generated.channels.length} channels, ${generated.kpis.length} KPIs, ${generated.risks.length} risks.`,
    };
  }
}
