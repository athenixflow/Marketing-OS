import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { discoverySchema } from "../engines/brand-intelligence/competitor-discovery.js";
import type { BrandData, CompetitorData } from "../memory/schema.js";

/** Maps the competitive landscape from real, cited web research. */
export class CompetitorResearchAgent extends BaseAgent {
  readonly name: AgentName = "competitor-research";
  readonly title = "Competitor Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly grounded = true;
  readonly systemPrompt =
    "You are a competitive intelligence analyst. You identify REAL competitors, verify them " +
    "against the live web, analyze their positioning, and find defensible whitespace.";
  readonly rubric =
    `- Competitors are real, named companies verifiable via the cited sources.\n` +
    `- Strengths/weaknesses are evidence-based, not generic.\n` +
    `- Differentiators are specific to OUR brand vs each competitor.\n` +
    `- The market gap is concrete and ownable.\n` +
    `- Confidence reflects how well the competitor set was verified.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    const { data, sources, grounded } = await this.researchJSON(
      `Find the real direct and indirect competitors of ${brand.name} — ${brand.description}.
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
POSITIONING: ${brand.voice?.positioning ?? "n/a"}
Search for actual competing brands/companies, their websites, positioning, and reputation.`,
      `Map the competitive landscape for ${brand.name}. For each real competitor give
positioning, strengths, weaknesses, and how ${brand.name} can differentiate. Identify the
clearest ownable market gap. Populate "sources" from the research and set confidence honestly.`,
      discoverySchema,
      { temperature: 0.4, maxTokens: 5000, cache: ctx.memory.researchCache() }
    );

    const result: CompetitorData = {
      competitors: data.competitors,
      marketGap: data.marketGap,
      sources: data.sources?.length ? data.sources : sources,
      assumptions: data.assumptions,
      confidence: grounded ? data.confidence : "low",
    };
    await ctx.memory.set("competitors", result);
    ctx.set("competitors", result);

    return {
      output: result,
      summary: `Identified ${data.competitors.length} competitors, ${result.sources?.length ?? 0} sources (${result.confidence} confidence); gap: ${data.marketGap.slice(0, 70)}…`,
    };
  }
}
