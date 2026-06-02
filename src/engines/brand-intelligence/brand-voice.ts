import { z } from "zod";
import { completeJSON } from "../../core/llm.js";
import type { ScrapedPage } from "./scraper.js";
import { buildCorpus } from "./extractor.js";

/** LLM analysis of how the brand speaks: tone, vocabulary, positioning. */

const voiceSchema = z.object({
  tone: z.array(z.string()).describe("3-6 adjectives describing the tone of voice"),
  vocabulary: z
    .array(z.string())
    .describe("Distinctive words/phrases the brand repeatedly uses"),
  positioning: z.string().describe("One sentence on how the brand positions itself"),
  summary: z.string().describe("A short paragraph a copywriter could use to match the voice"),
});

export type BrandVoice = z.infer<typeof voiceSchema>;

export async function analyzeBrandVoice(pages: ScrapedPage[]): Promise<BrandVoice> {
  const corpus = buildCorpus(pages, 10000);

  const prompt = `Read the brand's website copy below and characterize its brand voice so another
writer could convincingly imitate it.

WEBSITE COPY:
${corpus}`;

  return completeJSON(prompt, voiceSchema, {
    tier: "sonnet",
    system:
      "You are a brand voice strategist. You distill how a brand communicates into tone, " +
      "vocabulary, and positioning that a copywriter can reuse.",
    temperature: 0.4,
  });
}
