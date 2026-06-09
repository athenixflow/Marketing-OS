import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { normalizeUrl } from "../utils/slug.js";
import { crawl } from "../engines/brand-intelligence/crawler.js";
import type { ScrapedPage } from "../engines/brand-intelligence/scraper.js";
import { croSchema, croPrompt, renderCroMarkdown, type CROAudit } from "../engines/cro/cro-engine.js";
import type { BrandData } from "../memory/schema.js";

/** Audits the website for conversion blockers and writes a CRO report. */
export class CroAgent extends BaseAgent {
  readonly name: AgentName = "cro";
  readonly title = "CRO Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are the CRO Agent. You audit websites for conversion blockers and produce " +
    "prioritized, evidence-based optimization recommendations.";
  readonly rubric =
    `- Findings reference actual page elements/copy, not generic best practices.\n` +
    `- Severity and the overall score are justified by the observations.\n` +
    `- Recommendations are specific, prioritized by impact/effort, and implementable.\n` +
    `- The conversion-blocker narrative is sharp and evidence-based.`;

  protected async handle(task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");

    // Reuse pages crawled by Brand Intelligence: first the in-process blackboard,
    // then the on-disk cache (staged `cro`), and only crawl as a last resort.
    let pages = ctx.get<ScrapedPage[]>("crawledPages");
    if (!pages || pages.length === 0) {
      pages = await ctx.memory.readAssetJson<ScrapedPage[]>("crawl-pages.json", []);
    }
    if (!pages || pages.length === 0) {
      const url = normalizeUrl(String(task.input?.url ?? brand.url ?? ctx.memory.project.url ?? ""));
      pages = (await crawl(url)).pages;
    }

    const audit: CROAudit = await this.deepThinkJSON(croPrompt(pages, brand), croSchema, {
      temperature: 0.3,
      maxTokens: 7000,
    });
    const md = renderCroMarkdown(audit, brand.name ?? ctx.memory.project.name);
    const file = await ctx.memory.recordAsset("cro-audit.md", md);
    ctx.set("croAudit", audit);

    return {
      output: { score: audit.overallScore, recommendations: audit.recommendations.length, file },
      summary: `CRO score ${audit.overallScore}/100 with ${audit.recommendations.length} recommendations → ${file}`,
    };
  }
}
