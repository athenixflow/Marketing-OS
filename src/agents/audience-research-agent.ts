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
});

/** Builds audience segments + buyer personas from the brand profile. */
export class AudienceResearchAgent extends BaseAgent {
  readonly name: AgentName = "audience-research";
  readonly title = "Audience Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Audience Research Agent. You define precise customer segments and personas " +
    "with their pains, desires, objections, and preferred channels.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    const result = await this.thinkJSON(
      `Define the target audience for this brand.

BRAND: ${brand.name} — ${brand.description}
PRODUCTS/SERVICES: ${[...brand.products, ...brand.services].map((x) => x.name).join(", ") || "n/a"}
POSITIONING: ${brand.voice?.positioning ?? "n/a"}

Produce 2-4 distinct audience segments (with pain points, desires, objections, channels) and
2-3 concrete buyer personas (demographic, psychographic, buying triggers).`,
      audienceSchema,
      { temperature: 0.5 }
    );

    const data: AudienceData = { segments: result.segments, personas: result.personas };
    await ctx.memory.set("audience", data);
    ctx.set("audience", data);

    return {
      output: data,
      summary: `Defined ${result.segments.length} segments and ${result.personas.length} personas.`,
    };
  }
}
