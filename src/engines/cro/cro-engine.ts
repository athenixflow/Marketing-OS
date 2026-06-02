import { z } from "zod";
import { completeJSON } from "../../core/llm.js";
import type { ScrapedPage } from "../brand-intelligence/scraper.js";
import { buildCorpus } from "../brand-intelligence/extractor.js";
import type { BrandData } from "../../memory/schema.js";

/**
 * Conversion Rate Optimization engine: audits a website's messaging, CTAs, UX
 * signals, and funnel, then returns scored, prioritized recommendations.
 *
 * Since we crawl HTML (not render), the audit focuses on content/messaging/CTA
 * structure and information architecture rather than pixel-level visual design.
 */

const croSchema = z.object({
  overallScore: z.number().min(0).max(100).describe("Overall conversion-readiness score"),
  websiteAudit: z.array(finding()).describe("Messaging, clarity, value-prop findings"),
  ctaAudit: z.array(finding()).describe("CTA presence, clarity, placement findings"),
  uxAudit: z.array(finding()).describe("Information architecture, friction, trust findings"),
  funnelAudit: z.array(finding()).describe("Awareness -> consideration -> conversion gaps"),
  conversionAnalysis: z.string().describe("Narrative analysis of likely conversion blockers"),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        impact: z.enum(["high", "medium", "low"]),
        effort: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("Prioritized, specific optimizations"),
});

function finding() {
  return z.object({
    area: z.string(),
    observation: z.string(),
    severity: z.enum(["critical", "major", "minor"]),
  });
}

export type CROAudit = z.infer<typeof croSchema>;

export async function auditConversion(pages: ScrapedPage[], brand: BrandData): Promise<CROAudit> {
  const corpus = buildCorpus(pages, 11000);
  const allCtas = [...new Set(pages.flatMap((p) => p.ctaCandidates))].join(", ");

  const prompt = `Perform a conversion rate optimization (CRO) audit of this website.

BRAND: ${brand.name} — ${brand.description}
DETECTED CTAS: ${allCtas || "none detected"}

WEBSITE CONTENT (crawled HTML, no JS render):
${corpus}

Audit four areas — overall website/messaging, CTAs, UX/information architecture, and the
conversion funnel. Give an overall conversion-readiness score (0-100), specific findings with
severity, a narrative on the biggest conversion blockers, and a prioritized list of
recommendations tagged by impact and effort. Be concrete and reference actual page elements.`;

  return completeJSON(prompt, croSchema, {
    tier: "opus",
    system:
      "You are a CRO specialist who audits sites for conversion blockers and returns " +
      "prioritized, evidence-based recommendations.",
    temperature: 0.4,
    maxTokens: 6000,
  });
}

/** Render a CRO audit as a readable Markdown report. */
export function renderCroMarkdown(audit: CROAudit, brandName: string): string {
  const section = (title: string, items: ReturnType<typeof finding> extends infer _ ? any[] : never) =>
    `## ${title}\n` +
    (items.length
      ? items.map((f: any) => `- **[${f.severity}] ${f.area}** — ${f.observation}`).join("\n")
      : "- No issues found.") +
    "\n";

  const recs = audit.recommendations
    .map((r) => `- **${r.title}** _(impact: ${r.impact}, effort: ${r.effort})_\n  ${r.rationale}`)
    .join("\n");

  return `# CRO Audit — ${brandName}

**Overall conversion-readiness score: ${audit.overallScore}/100**

${audit.conversionAnalysis}

${section("Website & Messaging Audit", audit.websiteAudit as any)}
${section("CTA Audit", audit.ctaAudit as any)}
${section("UX & Information Architecture Audit", audit.uxAudit as any)}
${section("Funnel Audit", audit.funnelAudit as any)}
## Prioritized Recommendations
${recs}
`;
}
