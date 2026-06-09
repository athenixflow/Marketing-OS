import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { BrandData, AudienceData, StrategyData } from "../memory/schema.js";

const funnelSchema = z.object({
  stages: z.array(
    z.object({
      stage: z.enum(["awareness", "interest", "consideration", "conversion", "retention"]),
      goal: z.string(),
      tactics: z.array(z.string()),
      offer: z.string().describe("The offer / asset that moves people to the next stage"),
      metric: z.string(),
    })
  ),
  leadMagnets: z.array(z.string()),
  nurtureSequence: z.array(z.string()).describe("Email/DM sequence outline"),
});

/** Designs the end-to-end conversion funnel and nurture path. */
export class FunnelStrategyAgent extends BaseAgent {
  readonly name: AgentName = "funnel-strategy";
  readonly title = "Funnel Strategy Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Funnel Strategy Agent. You design full-funnel customer journeys from " +
    "awareness to retention with the right offers and metrics at each stage.";
  readonly rubric =
    `- Each stage has a clear goal, a concrete offer that advances prospects, and a real metric.\n` +
    `- Tactics are specific to this brand/audience, not generic funnel boilerplate.\n` +
    `- Lead magnets and nurture sequence are actionable and sequenced.\n` +
    `- The funnel is coherent end-to-end (awareness → retention).`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, strategy] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<StrategyData>("strategy"),
    ]);

    const funnel = await this.deepThinkJSON(
      `Design a full-funnel strategy for ${brand.name}.
OFFERS AVAILABLE: ${brand.offers.map((o) => o.name).join(", ") || "n/a"}
AUDIENCE: ${audience.segments.map((s) => s.name).join(", ") || "general"}
POSITIONING: ${strategy.positioning ?? "n/a"}

Map each funnel stage (awareness → retention) to goals, tactics, the offer that advances
prospects, and the key metric. Propose lead magnets and a nurture sequence outline.`,
      funnelSchema,
      { temperature: 0.5 }
    );

    const asset = await ctx.memory.recordAsset("funnel-strategy.json", JSON.stringify(funnel, null, 2));
    ctx.set("funnel", funnel);

    return {
      output: funnel,
      summary: `Designed ${funnel.stages.length}-stage funnel with ${funnel.leadMagnets.length} lead magnets → ${asset}`,
    };
  }
}
