import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { BrandData, AudienceData } from "../memory/schema.js";

const audienceSchema = z.object({
  segments: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      painPoints: z.array(z.string()),
      desires: z.array(z.string()),
      objections: z.array(z.string()),
      channels: z.array(z.string()),
    })
  ),
  personas: z.array(
    z.object({
      name: z.string(),
      demographic: z.string(),
      psychographic: z.string(),
      buyingTriggers: z.array(z.string()),
    })
  ),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  assumptions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

/** Builds audience segments + personas, grounded in real market/demographic evidence. */
export class AudienceResearchAgent extends BaseAgent {
  readonly name: AgentName = "audience-research";
  readonly title = "Audience Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly grounded = true;
  readonly systemPrompt =
    "You are an audience research analyst. You define precise customer segments and personas " +
    "grounded in real demographic, behavioral, and category evidence — with sources.";
  readonly rubric =
    `- Segments are distinct, sized or qualified, and specific to this category.\n` +
    `- Pains/desires/objections are concrete and believable, not generic.\n` +
    `- Personas are actionable for targeting and messaging.\n` +
    `- Claims are grounded in cited evidence where possible; assumptions are disclosed.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    const { data, sources, grounded } = await this.researchJSON(
      `Research the target audience for ${brand.name} — ${brand.description}.
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
POSITIONING: ${brand.voice?.positioning ?? "n/a"}
Find who actually buys this category: demographics, behaviors, motivations, where they spend attention.`,
      `Define 2-4 distinct audience segments (pains, desires, objections, channels) and 2-3
buyer personas (demographic, psychographic, buying triggers) for ${brand.name}. Populate
"sources" from the research; set confidence honestly.`,
      audienceSchema,
      { temperature: 0.4, maxTokens: 5000, cache: ctx.memory.researchCache() }
    );

    const result: AudienceData = {
      segments: data.segments,
      personas: data.personas,
      sources: data.sources?.length ? data.sources : sources,
      assumptions: data.assumptions,
      confidence: grounded ? data.confidence : "low",
    };
    await ctx.memory.set("audience", result);
    ctx.set("audience", result);

    return {
      output: result,
      summary: `Defined ${data.segments.length} segments, ${data.personas.length} personas, ${result.sources?.length ?? 0} sources (${result.confidence} confidence).`,
    };
  }
}
