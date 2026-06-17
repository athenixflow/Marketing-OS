import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { BrandData, AudienceData } from "../memory/schema.js";

const seoSchema = z.object({
  pillarTopics: z.array(z.string()).describe("Topical authority pillars"),
  keywordClusters: z.array(
    z.object({
      cluster: z.string(),
      intent: z.enum(["informational", "commercial", "transactional", "navigational"]),
      keywords: z.array(z.string()),
      estimatedDemand: z.string().default("").describe("Rough search demand if known from research"),
    })
  ),
  onPageRecommendations: z.array(z.string()),
  contentGaps: z.array(z.string()),
  technicalNotes: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  confidence: z.enum(["high", "medium", "low"]),
});

/** Builds keyword clusters and an SEO roadmap, grounded in real search research. */
export class SeoStrategyAgent extends BaseAgent {
  readonly name: AgentName = "seo-strategy";
  readonly title = "SEO Strategy Agent";
  readonly tier: ModelTier = "sonnet";
  readonly grounded = true;
  readonly systemPrompt =
    "You are the SEO Strategy Agent. You build topical authority maps, keyword clusters by " +
    "intent, and actionable on-page + technical recommendations — grounded in real search data.";
  readonly rubric =
    `- Keyword clusters reflect real search behavior for this category (not invented terms).\n` +
    `- Clusters are correctly grouped by intent and tied to the buyer journey.\n` +
    `- On-page + technical recommendations are specific and prioritized.\n` +
    `- Content gaps point at winnable, high-intent opportunities.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
    ]);

    const { data: seo, sources } = await this.researchJSON(
      `Research SEO opportunities for ${brand.name} (${brand.description}).
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
Find what this audience actually searches for, competitor content angles, and high-intent terms.`,
      `Build an SEO strategy: pillar topics, keyword clusters by intent (with rough demand where
known), on-page recommendations, content gaps, and technical notes. Populate "sources".`,
      seoSchema,
      { temperature: 0.4, maxTokens: 5000, cache: ctx.memory.researchCache() }
    );

    const asset = await ctx.memory.recordAsset("seo-strategy.json", JSON.stringify({ ...seo, sources: seo.sources?.length ? seo.sources : sources }, null, 2));
    ctx.set("seo", seo);

    return {
      output: seo,
      summary: `Built ${seo.keywordClusters.length} keyword clusters across ${seo.pillarTopics.length} pillars, ${(seo.sources?.length || sources.length)} sources → ${asset}`,
    };
  }
}
