import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { StrategyData } from "../memory/schema.js";

const measurementSchema = z.object({
  northStarMetric: z.string(),
  dashboard: z.array(
    z.object({
      metric: z.string(),
      definition: z.string(),
      target: z.string(),
      source: z.string().describe("Where to measure it, e.g. GA4, Meta Ads, CRM"),
    })
  ),
  experiments: z.array(
    z.object({ hypothesis: z.string(), test: z.string(), successMetric: z.string() })
  ),
  reportingCadence: z.string(),
});

/** Defines the measurement plan, KPI dashboard, and experiment backlog. */
export class AnalyticsAgent extends BaseAgent {
  readonly name: AgentName = "analytics";
  readonly title = "Analytics Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Analytics Agent. You design measurement frameworks: a north-star metric, a " +
    "KPI dashboard with data sources, and a prioritized experiment backlog.";
  readonly rubric =
    `- North-star metric truly captures value creation for this business model.\n` +
    `- Each KPI has a precise definition, a target, and a real data source/tool.\n` +
    `- Experiments are prioritized with a clear hypothesis and success metric.\n` +
    `- The framework is consistent with the strategy's KPIs and the financial model.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const strategy = await ctx.memory.get<StrategyData>("strategy");

    const plan = await this.deepThinkJSON(
      `Build the measurement plan for this marketing strategy.
POSITIONING: ${strategy.positioning ?? "n/a"}
GROWTH STRATEGY: ${strategy.growthStrategy ?? "n/a"}
EXISTING KPIS: ${(strategy.kpis ?? []).map((k) => k.metric).join(", ") || "none yet"}
CHANNELS: ${(strategy.channels ?? []).map((c) => c.channel).join(", ") || "n/a"}

Define a north-star metric, a KPI dashboard (metric, definition, target, data source), an
experiment backlog (hypothesis, test, success metric), and a reporting cadence.`,
      measurementSchema,
      { temperature: 0.4 }
    );

    const file = await ctx.memory.recordAsset("measurement-plan.json", JSON.stringify(plan, null, 2));
    ctx.set("measurementPlan", plan);

    return {
      output: plan,
      summary: `North-star: ${plan.northStarMetric}; ${plan.dashboard.length} KPIs, ${plan.experiments.length} experiments → ${file}`,
    };
  }
}
