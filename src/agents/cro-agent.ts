import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { normalizeUrl } from "../utils/slug.js";
import { crawl } from "../engines/brand-intelligence/crawler.js";
import type { ScrapedPage } from "../engines/brand-intelligence/scraper.js";
import { auditConversion, renderCroMarkdown } from "../engines/cro/cro-engine.js";
import type { BrandData } from "../memory/schema.js";

/** Audits the website for conversion blockers and writes a CRO report. */
export class CroAgent extends BaseAgent {
  readonly name: AgentName = "cro";
  readonly title = "CRO Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are the CRO Agent. You audit websites for conversion blockers and produce " +
    "prioritized, evidence-based optimization recommendations.";

  protected async handle(task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    // Reuse pages crawled by Brand Intelligence if available; otherwise crawl now.
    let pages = ctx.get<ScrapedPage[]>("crawledPages");
    if (!pages || pages.length === 0) {
      const url = normalizeUrl(String(task.input?.url ?? brand.url ?? ctx.memory.project.url ?? ""));
      pages = (await crawl(url)).pages;
    }

    const audit = await auditConversion(pages, brand);
    const md = renderCroMarkdown(audit, brand.name ?? ctx.memory.project.name);
    const file = await ctx.memory.recordAsset("cro-audit.md", md);
    ctx.set("croAudit", audit);

    return {
      output: { score: audit.overallScore, recommendations: audit.recommendations.length, file },
      summary: `CRO score ${audit.overallScore}/100 with ${audit.recommendations.length} recommendations → ${file}`,
    };
  }
}
