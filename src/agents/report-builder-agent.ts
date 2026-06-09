import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { buildReport } from "../engines/report/report-engine.js";
import type {
  BrandData,
  MarketData,
  AudienceData,
  CompetitorData,
  StrategyData,
  FinancialData,
  ContentCalendarData,
} from "../memory/schema.js";

/** Compiles all memory + assets into one board-ready Markdown report + sources.json. */
export class ReportBuilderAgent extends BaseAgent {
  readonly name: AgentName = "report-builder";
  readonly title = "Report Builder Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are an engagement lead writing the executive summary of a board-ready marketing " +
    "strategy report. You are concise, decisive, and evidence-led.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, market, audience, competitors, strategy, financials, content] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<MarketData>("market"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<CompetitorData>("competitors"),
      ctx.memory.get<StrategyData>("strategy"),
      ctx.memory.get<FinancialData>("financials"),
      ctx.memory.get<ContentCalendarData>("content-calendar"),
    ]);

    // Pull in asset-file deliverables (best-effort; skip if a stage wasn't run).
    const [funnel, seo, creative, measurement] = await Promise.all([
      ctx.memory.readAssetJson("funnel-strategy.json", null),
      ctx.memory.readAssetJson("seo-strategy.json", null),
      ctx.memory.readAssetJson("creative-package.json", null),
      ctx.memory.readAssetJson("measurement-plan.json", null),
    ]);

    // A fresh, tight executive summary grounded in the assembled facts.
    const executiveSummary = await this.think(
      `Write a board-ready executive summary (4-6 short paragraphs, Markdown) for ${brand.name}.
POSITIONING: ${strategy.positioning ?? "n/a"}
GROWTH THESIS: ${strategy.growthStrategy ?? "n/a"}
MARKET: ${market.category ?? "n/a"} (${market.tam ?? "size n/a"}, growth ${market.growthRate ?? "n/a"})
UNIT ECONOMICS: ${financials.unitEconomics ? JSON.stringify(financials.unitEconomics) : "n/a"}
TOP KPIS: ${(strategy.kpis ?? []).slice(0, 4).map((k) => `${k.metric}→${k.target}`).join("; ") || "n/a"}
Lead with the opportunity and the wedge; be specific and decisive.`,
      { temperature: 0.4, maxTokens: 1500 }
    );

    const { markdown, sources } = buildReport({
      brand,
      market,
      audience,
      competitors,
      strategy,
      financials,
      content,
      funnel,
      seo,
      creative,
      measurement,
      executiveSummary,
      date: new Date().toISOString().slice(0, 10),
    });

    const reportFile = await ctx.memory.recordAsset("strategy-report.md", markdown);
    await ctx.memory.recordAsset("sources.json", JSON.stringify(sources, null, 2));

    return {
      output: { reportFile, sources: sources.length },
      summary: `Compiled board-ready report (${markdown.length.toLocaleString()} chars, ${sources.length} cited sources) → ${reportFile}`,
    };
  }
}
