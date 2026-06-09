import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { marketSchema } from "../engines/market/market-engine.js";
import type { BrandData, MarketData } from "../memory/schema.js";

/** Web-grounded market sizing, trends, and benchmarks for the brand's category. */
export class MarketResearchAgent extends BaseAgent {
  readonly name: AgentName = "market-research";
  readonly title = "Market Research / Data Analyst Agent";
  readonly tier: ModelTier = "opus";
  readonly grounded = true;
  readonly systemPrompt =
    "You are a market research analyst at a top strategy firm. You size markets " +
    "(TAM/SAM/SOM), quantify growth, and surface benchmarks — always grounded in real, " +
    "cited sources, and explicit about assumptions when data is unverifiable.";
  readonly rubric =
    `- Every figure (TAM/SAM/SOM, growth, benchmarks) is sourced or clearly flagged as an estimate with its basis.\n` +
    `- Sizing logic is shown (how SAM/SOM derive from TAM), not asserted.\n` +
    `- Trends are current and specific to this category, each with a concrete implication.\n` +
    `- Benchmarks are category-relevant and usable as targets downstream.\n` +
    `- Confidence reflects the true strength of the evidence.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    const category = brand.voice?.positioning ?? brand.description ?? brand.name ?? "this market";
    const { data, sources, grounded } = await this.researchJSON(
      `Research the market for ${brand.name} — ${brand.description}.
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
Find: the market category and its size (TAM/SAM/SOM with figures + year), the category
growth rate (CAGR), current trends, and industry benchmarks (typical conversion rate, AOV,
CAC, ROAS, retention) for this kind of business.`,
      `Produce a rigorous market analysis for ${brand.name} (category context: ${category}).
Show how SAM and SOM derive from TAM. Flag any unverifiable figure as an assumption.`,
      marketSchema,
      { temperature: 0.3, maxTokens: 5000 }
    );

    const market: MarketData = { ...data };
    if (sources.length && (market.sources?.length ?? 0) === 0) market.sources = sources;
    if (!grounded) market.confidence = "low";
    await ctx.memory.set("market", market);
    ctx.set("market", market);

    return {
      output: market,
      summary: `Sized market (${market.tam} TAM), ${market.trends.length} trends, ${market.benchmarks.length} benchmarks, ${market.sources?.length ?? 0} sources (${market.confidence} confidence).`,
    };
  }
}
