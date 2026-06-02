import { z } from "zod";
import { completeJSON } from "../../core/llm.js";
import type { BrandVoice } from "./brand-voice.js";

/** Minimal brand shape this engine needs (compatible with BrandData). */
export interface BrandProfileLike {
  name?: string;
  description?: string;
  products: Array<{ name: string }>;
  services: Array<{ name: string }>;
}

/**
 * Derives likely competitors from what the brand sells + how it positions
 * itself. Without a live search API we rely on the model's market knowledge,
 * which is explicitly framed as "likely / candidate" competitors.
 */

const discoverySchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().default(""),
        positioning: z.string().default(""),
        strengths: z.array(z.string()).default([]),
        weaknesses: z.array(z.string()).default([]),
        differentiators: z
          .array(z.string())
          .default([])
          .describe("How OUR brand could differentiate from this competitor"),
      })
    )
    .describe("4-8 likely competitors"),
  marketGap: z.string().describe("An underserved gap our brand could own"),
});

export type Discovery = z.infer<typeof discoverySchema>;

export async function discoverCompetitors(
  brand: BrandProfileLike,
  voice: BrandVoice
): Promise<Discovery> {
  const prompt = `Our brand profile:
NAME: ${brand.name ?? "the brand"}
DESCRIPTION: ${brand.description ?? ""}
PRODUCTS: ${brand.products.map((p) => p.name).join(", ") || "n/a"}
SERVICES: ${brand.services.map((s) => s.name).join(", ") || "n/a"}
POSITIONING: ${voice.positioning}

Identify the most likely direct and indirect competitors in this market. For each, note
positioning, strengths, weaknesses, and how our brand could differentiate. Then name the
clearest market gap we could own. Frame competitors as candidates to validate later.`;

  return completeJSON(prompt, discoverySchema, {
    tier: "sonnet",
    system:
      "You are a competitive intelligence analyst. You map a brand's competitive landscape " +
      "and find positioning whitespace.",
    temperature: 0.5,
  });
}
