import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { generateStrategy, toStrategyData } from "../engines/strategy/strategy-engine.js";
import type { BrandData, AudienceData, CompetitorData } from "../memory/schema.js";

/** Produces the master 30/60/90 strategy, positioning, channels, KPIs. */
export class MarketingStrategyAgent extends BaseAgent {
  readonly name: AgentName = "marketing-strategy";
  readonly title = "Marketing Strategy Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are the Marketing Strategy Agent. You synthesize brand, audience, and competitor " +
    "intelligence into a sharp, sequenced 90-day strategy.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, competitors] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<CompetitorData>("competitors"),
    ]);

    const generated = await generateStrategy({ brand, audience, competitors, goal: ctx.goal });
    const data = toStrategyData(generated);
    // Merge so funnel/SEO agents can add to the same record later.
    await ctx.memory.merge("strategy", data);
    ctx.set("strategy", data);

    return {
      output: data,
      summary: `Built positioning + 30/60/90 plan, ${generated.channels.length} channels, ${generated.kpis.length} KPIs.`,
    };
  }
}
