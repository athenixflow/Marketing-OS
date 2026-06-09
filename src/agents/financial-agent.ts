import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { financeSchema } from "../engines/finance/finance-engine.js";
import type { BrandData, MarketData, StrategyData, FinancialData } from "../memory/schema.js";

/** Builds the unit-economics model, budget allocation, projection, and sensitivity. */
export class FinancialAgent extends BaseAgent {
  readonly name: AgentName = "financial";
  readonly title = "Financial / Unit-Economics Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are a growth-finance analyst. You build defensible unit-economics models " +
    "(CAC, LTV, payback), allocate budget across channels, project revenue, and run " +
    "sensitivity analysis — every number tied to a stated, benchmark-anchored assumption.";
  readonly rubric =
    `- Unit economics are internally consistent (LTV:CAC, payback, margin all reconcile).\n` +
    `- Every figure is anchored to a market benchmark or an explicitly stated assumption.\n` +
    `- Budget allocation matches the strategy's prioritized channels and sums sensibly.\n` +
    `- The projection is realistic (no hockey-stick without justification).\n` +
    `- Sensitivity covers best/base/worst with the key driver named for each.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, market, strategy] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<MarketData>("market"),
      ctx.memory.get<StrategyData>("strategy"),
    ]);

    const benchmarks = (market.benchmarks ?? [])
      .map((b) => `${b.metric}: ${b.value} (${b.context})`)
      .join("; ");
    const channels = (strategy.channels ?? []).map((c) => c.channel).join(", ") || "the prioritized channels";

    const model = await this.deepThinkJSON(
      `Build the financial model for ${brand.name} — ${brand.description}.

PRODUCTS/PRICING SIGNALS: ${brand.products.map((p) => `${p.name}${p.price ? ` (${p.price})` : ""}`).join(", ") || "n/a"}
MARKET BENCHMARKS: ${benchmarks || "none provided — state assumptions"}
STRATEGY CHANNELS: ${channels}
GROWTH STRATEGY: ${strategy.growthStrategy ?? "n/a"}

Produce: unit economics (AOV, target CAC, LTV, LTV:CAC, payback, gross margin); a monthly
budget allocation across the strategy channels; a 30/60/90 spend→revenue→ROAS projection;
and best/base/worst sensitivity. Anchor every figure to a benchmark or a stated assumption.`,
      financeSchema,
      { temperature: 0.3, maxTokens: 5000 }
    );

    const data: FinancialData = { ...model };
    await ctx.memory.set("financials", data);
    ctx.set("financials", data);

    return {
      output: data,
      summary: `Modeled unit economics (LTV:CAC ${model.unitEconomics.ltvToCac}, payback ${model.unitEconomics.paybackMonths}), ${model.budgetAllocation.length}-channel budget, ${model.projection.length}-period projection.`,
    };
  }
}
