import { z } from "zod";
import { completeJSON } from "../../core/llm.js";
import type { ScrapedPage } from "./scraper.js";

/**
 * LLM-powered extraction of commercial entities (products, services, offers,
 * CTAs) and the basic brand identity from scraped website content.
 */

const extractionSchema = z.object({
  name: z.string().describe("The brand / company name"),
  tagline: z.string().describe("Tagline or one-line value proposition, empty if none"),
  description: z.string().describe("2-3 sentence description of what the brand does"),
  products: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().default(""),
        price: z.string().default(""),
      })
    )
    .describe("Physical or digital products sold"),
  services: z
    .array(z.object({ name: z.string(), description: z.string().default("") }))
    .describe("Services offered"),
  offers: z
    .array(z.object({ name: z.string(), details: z.string().default("") }))
    .describe("Promotions, lead magnets, free trials, discounts, bundles"),
  ctas: z
    .array(z.object({ text: z.string(), location: z.string().default("") }))
    .describe("Calls to action found on the site"),
});

export type Extraction = z.infer<typeof extractionSchema>;

export async function extractBrandEntities(pages: ScrapedPage[]): Promise<Extraction> {
  const corpus = buildCorpus(pages);

  const prompt = `Analyze the following website content and extract the brand's commercial profile.
Be precise and only include items actually present in the content. Do not invent prices.

WEBSITE CONTENT:
${corpus}`;

  return completeJSON(prompt, extractionSchema, {
    tier: "haiku",
    system:
      "You are a meticulous brand analyst. You extract structured facts from website copy " +
      "without embellishment. If something is not stated, leave it empty.",
    temperature: 0.2,
  });
}

/** Compose a compact corpus from the most informative pages. */
export function buildCorpus(pages: ScrapedPage[], maxChars = 12000): string {
  const blocks = pages.map(
    (p) =>
      `URL: ${p.url}\nTITLE: ${p.title}\nMETA: ${p.metaDescription}\n` +
      `HEADINGS: ${p.headings.join(" | ")}\n` +
      `CTAS: ${p.ctaCandidates.join(", ")}\n` +
      `TEXT: ${p.text.slice(0, 2000)}\n---`
  );
  let out = "";
  for (const b of blocks) {
    if (out.length + b.length > maxChars) break;
    out += b + "\n";
  }
  return out || "(no readable content was retrieved)";
}
