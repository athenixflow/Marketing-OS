import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { normalizeUrl } from "../utils/slug.js";
import { crawl } from "../engines/brand-intelligence/crawler.js";
import { extractBrandEntities } from "../engines/brand-intelligence/extractor.js";
import { analyzeBrandVoice } from "../engines/brand-intelligence/brand-voice.js";
import type { BrandData } from "../memory/schema.js";

/** Crawls + analyzes a website to build the brand profile in memory. */
export class BrandIntelligenceAgent extends BaseAgent {
  readonly name: AgentName = "brand-intelligence";
  readonly title = "Brand Intelligence Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Brand Intelligence Agent. You analyze a company's website to understand " +
    "what they sell, how they speak, and what they stand for.";

  protected async handle(task: Task, ctx: SharedContext): Promise<AgentResult> {
    const url = normalizeUrl(String(task.input?.url ?? ctx.memory.project.url ?? ""));

    const result = await crawl(url);
    if (result.lowYield) {
      await ctx.memory.log({
        level: "warn",
        scope: this.name,
        message: "Low text yield from crawl; brand data may be partial (JS-rendered site).",
      });
    }
    // Share pages so the CRO agent can reuse them without re-crawling.
    ctx.set("crawledPages", result.pages);

    const [extraction, voice] = await Promise.all([
      extractBrandEntities(result.pages),
      analyzeBrandVoice(result.pages),
    ]);

    const brand: BrandData = {
      url,
      name: extraction.name,
      tagline: extraction.tagline,
      description: extraction.description,
      products: extraction.products,
      services: extraction.services,
      offers: extraction.offers,
      ctas: extraction.ctas,
      voice,
      pagesAnalyzed: result.pages.map((p) => p.url),
    };
    await ctx.memory.set("brand", brand);
    ctx.set("brand", brand);

    return {
      output: brand,
      summary: `Analyzed ${result.pages.length} pages of ${extraction.name}: ${extraction.products.length} products, ${extraction.services.length} services, voice captured.`,
    };
  }
}
