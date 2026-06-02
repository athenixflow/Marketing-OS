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
    })
  ),
  onPageRecommendations: z.array(z.string()),
  contentGaps: z.array(z.string()),
  technicalNotes: z.array(z.string()),
});

/** Builds keyword clusters and an SEO content/technical roadmap. */
export class SeoStrategyAgent extends BaseAgent {
  readonly name: AgentName = "seo-strategy";
  readonly title = "SEO Strategy Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the SEO Strategy Agent. You build topical authority maps, keyword clusters by " +
    "intent, and actionable on-page + technical recommendations.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
    ]);

    const seo = await this.thinkJSON(
      `Create an SEO strategy for ${brand.name} (${brand.description}).
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
AUDIENCE PAINS: ${audience.segments.flatMap((s) => s.painPoints).slice(0, 8).join("; ") || "n/a"}

Define pillar topics, keyword clusters grouped by search intent, on-page recommendations,
content gaps to fill, and technical SEO notes.`,
      seoSchema,
      { temperature: 0.4 }
    );

    const asset = await ctx.memory.recordAsset("seo-strategy.json", JSON.stringify(seo, null, 2));
    ctx.set("seo", seo);

    return {
      output: seo,
      summary: `Built ${seo.keywordClusters.length} keyword clusters across ${seo.pillarTopics.length} pillars → ${asset}`,
    };
  }
}
