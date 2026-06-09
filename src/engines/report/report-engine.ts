import type {
  BrandData,
  MarketData,
  AudienceData,
  CompetitorData,
  StrategyData,
  FinancialData,
  ContentCalendarData,
  Source,
} from "../../memory/schema.js";

export interface ReportInputs {
  brand: BrandData;
  market: MarketData;
  audience: AudienceData;
  competitors: CompetitorData;
  strategy: StrategyData;
  financials: FinancialData;
  content: ContentCalendarData;
  /** Optional asset-file contents pulled in by the agent. */
  funnel?: any;
  seo?: any;
  creative?: any;
  measurement?: any;
  /** Executive narrative (LLM-written) to open the report. */
  executiveSummary?: string;
  preparedFor?: string;
  date?: string;
}

/** Assemble a complete, board-ready Markdown report from all memory + assets. */
export function buildReport(d: ReportInputs): { markdown: string; sources: Source[] } {
  const date = d.date ?? new Date().toISOString().slice(0, 10);
  const name = d.brand.name ?? d.preparedFor ?? "the brand";
  const sources = dedupeSources([
    ...(d.market.sources ?? []),
    ...(d.competitors.sources ?? []),
    ...(d.audience.sources ?? []),
    ...(d.financials.sources ?? []),
  ]);
  const allAssumptions = [
    ...(d.strategy.assumptions ?? []),
    ...(d.market.assumptions ?? []),
    ...(d.financials.assumptions ?? []),
    ...(d.audience.assumptions ?? []),
  ];

  const S: string[] = [];
  S.push(`# ${name} — Marketing Strategy & Growth Plan`);
  S.push(`*Institutional Marketing Report · Prepared ${date}*\n`);

  if (d.executiveSummary) S.push(`## Executive Summary\n\n${d.executiveSummary}\n`);

  // Methodology & confidence
  S.push(`## Methodology & Evidence Base`);
  S.push(
    `This plan was produced by a multi-agent marketing system with web-grounded research, ` +
      `draft→critique→revise on every deliverable, and a managing-director QA review. ` +
      `Confidence by area — market: **${d.market.confidence ?? "n/a"}**, ` +
      `audience: **${d.audience.confidence ?? "n/a"}**, ` +
      `competitive: **${d.competitors.confidence ?? "n/a"}**, ` +
      `financials: **${d.financials.confidence ?? "n/a"}**. ` +
      `${sources.length} external sources cited (see appendix).\n`
  );

  // Market
  S.push(`## Market Analysis`);
  S.push(line("Category", d.market.category));
  S.push(line("TAM", d.market.tam));
  S.push(line("SAM", d.market.sam));
  S.push(line("SOM", d.market.som));
  S.push(line("Growth (CAGR)", d.market.growthRate));
  if (d.market.trends?.length) {
    S.push(`\n**Trends**`);
    S.push(d.market.trends.map((t) => `- **${t.trend}** — ${t.implication}`).join("\n"));
  }
  if (d.market.benchmarks?.length) {
    S.push(`\n**Benchmarks**`);
    S.push(d.market.benchmarks.map((b) => `- ${b.metric}: ${b.value} (${b.context})`).join("\n"));
  }
  S.push("");

  // Competitive
  S.push(`## Competitive Landscape`);
  if (d.competitors.marketGap) S.push(`**Market gap:** ${d.competitors.marketGap}\n`);
  for (const c of d.competitors.competitors ?? []) {
    S.push(`### ${c.name}${c.url ? ` (${c.url})` : ""}`);
    if (c.positioning) S.push(`*${c.positioning}*`);
    if (c.strengths?.length) S.push(`- Strengths: ${c.strengths.join("; ")}`);
    if (c.weaknesses?.length) S.push(`- Weaknesses: ${c.weaknesses.join("; ")}`);
    if (c.differentiators?.length) S.push(`- Our edge: ${c.differentiators.join("; ")}`);
  }
  S.push("");

  // Audience
  S.push(`## Audience`);
  for (const seg of d.audience.segments ?? []) {
    S.push(`### ${seg.name}`);
    S.push(seg.description);
    if (seg.painPoints?.length) S.push(`- Pains: ${seg.painPoints.join("; ")}`);
    if (seg.desires?.length) S.push(`- Desires: ${seg.desires.join("; ")}`);
    if (seg.objections?.length) S.push(`- Objections: ${seg.objections.join("; ")}`);
    if (seg.channels?.length) S.push(`- Channels: ${seg.channels.join(", ")}`);
  }
  if (d.audience.personas?.length) {
    S.push(`\n**Personas**`);
    S.push(d.audience.personas.map((p) => `- **${p.name}** — ${p.demographic}; ${p.psychographic}`).join("\n"));
  }
  S.push("");

  // Positioning & strategy
  S.push(`## Positioning & Strategy`);
  if (d.strategy.positioning) S.push(`**Positioning.** ${d.strategy.positioning}\n`);
  if (d.strategy.growthStrategy) S.push(`**Growth thesis.** ${d.strategy.growthStrategy}\n`);

  // 30/60/90
  S.push(`## 30 / 60 / 90-Day Roadmap`);
  for (const [label, plan] of [
    ["Days 0–30", d.strategy.plan30],
    ["Days 31–60", d.strategy.plan60],
    ["Days 61–90", d.strategy.plan90],
  ] as const) {
    if (!plan) continue;
    S.push(`### ${label} — ${plan.theme}`);
    if (plan.objectives?.length) S.push(`**Objectives:** ${plan.objectives.join("; ")}`);
    if (plan.initiatives?.length) S.push(plan.initiatives.map((i) => `- ${i}`).join("\n"));
    if (plan.milestones?.length) S.push(`**Milestones:** ${plan.milestones.join("; ")}`);
  }
  S.push("");

  // Channels
  if (d.strategy.channels?.length) {
    S.push(`## Channel Plan`);
    for (const c of d.strategy.channels) {
      S.push(`### ${c.channel}`);
      S.push(c.rationale);
      if (c.tactics?.length) S.push(c.tactics.map((t) => `- ${t}`).join("\n"));
    }
    S.push("");
  }

  // Funnel (asset)
  if (d.funnel?.stages?.length) {
    S.push(`## Funnel`);
    S.push(d.funnel.stages.map((s: any) => `- **${s.stage}** — ${s.goal} (offer: ${s.offer}; metric: ${s.metric})`).join("\n"));
    if (d.funnel.leadMagnets?.length) S.push(`\n**Lead magnets:** ${d.funnel.leadMagnets.join("; ")}`);
    S.push("");
  }

  // SEO (asset)
  if (d.seo?.keywordClusters?.length) {
    S.push(`## SEO`);
    if (d.seo.pillarTopics?.length) S.push(`**Pillars:** ${d.seo.pillarTopics.join(", ")}`);
    S.push(d.seo.keywordClusters.map((k: any) => `- **${k.cluster}** (${k.intent}): ${(k.keywords || []).slice(0, 6).join(", ")}`).join("\n"));
    S.push("");
  }

  // Content
  if (d.content.pillars?.length) {
    S.push(`## Content`);
    S.push(`**Pillars:** ${d.content.pillars.map((p) => p.name).join(" · ")}`);
    S.push(`Calendar: ${d.content.posts?.length ?? 0} planned posts.`);
    S.push("");
  }

  // Creative (asset)
  if (d.creative?.brief) {
    S.push(`## Creative Platform`);
    S.push(`**Big idea:** ${d.creative.brief.bigIdea}`);
    if (d.creative.brief.keyMessage) S.push(`**Key message:** ${d.creative.brief.keyMessage}`);
    if (d.creative.campaignAssets?.length) S.push(`Assets specified: ${d.creative.campaignAssets.length}.`);
    S.push("");
  }

  // Financials
  S.push(`## Financials & Unit Economics`);
  const u = d.financials.unitEconomics;
  if (u) {
    S.push(
      `| Metric | Value |\n|---|---|\n` +
        `| AOV | ${u.estimatedAOV} |\n| Target CAC | ${u.targetCAC} |\n` +
        `| LTV | ${u.estimatedLTV} |\n| LTV:CAC | ${u.ltvToCac} |\n` +
        `| Payback | ${u.paybackMonths} |\n| Gross margin | ${u.grossMargin} |`
    );
  }
  if (d.financials.budgetAllocation?.length) {
    S.push(`\n**Budget allocation**`);
    S.push(`| Channel | Monthly | Rationale |\n|---|---|---|`);
    S.push(d.financials.budgetAllocation.map((b) => `| ${b.channel} | ${b.monthlyBudget} | ${b.rationale} |`).join("\n"));
  }
  if (d.financials.projection?.length) {
    S.push(`\n**Projection**`);
    S.push(`| Period | Spend | Revenue | ROAS |\n|---|---|---|---|`);
    S.push(d.financials.projection.map((p) => `| ${p.period} | ${p.spend} | ${p.revenue} | ${p.roas} |`).join("\n"));
  }
  if (d.financials.sensitivity?.length) {
    S.push(`\n**Sensitivity**`);
    S.push(d.financials.sensitivity.map((s) => `- **${s.scenario}** (${s.assumption}): ${s.outcome}`).join("\n"));
  }
  S.push("");

  // KPIs
  if (d.strategy.kpis?.length) {
    S.push(`## KPI Framework`);
    S.push(`| Metric | Target | Cadence |\n|---|---|---|`);
    S.push(d.strategy.kpis.map((k) => `| ${k.metric} | ${k.target} | ${k.cadence} |`).join("\n"));
    S.push("");
  }

  // Risks
  if (d.strategy.risks?.length) {
    S.push(`## Risk Register`);
    S.push(`| Risk | Likelihood | Impact | Mitigation |\n|---|---|---|---|`);
    S.push(d.strategy.risks.map((r) => `| ${r.risk} | ${r.likelihood} | ${r.impact} | ${r.mitigation} |`).join("\n"));
    S.push("");
  }

  // Appendix
  S.push(`## Appendix`);
  if (allAssumptions.length) {
    S.push(`### Key Assumptions`);
    S.push(allAssumptions.map((a) => `- ${a}`).join("\n"));
  }
  S.push(`\n### Sources`);
  S.push(sources.length ? sources.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join("\n") : "_No external sources were cited (web grounding unavailable or disabled)._");
  S.push("");

  return { markdown: S.join("\n"), sources };
}

function line(label: string, value?: string): string {
  return value ? `**${label}:** ${value}  ` : "";
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    if (s?.url && !seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
}
