import { z } from "zod";
import type { BrandData, AudienceData, CompetitorData, MarketData, StrategyData } from "../../memory/schema.js";

/**
 * Strategy engine schema: positioning, growth thesis, 30/60/90 plans, channel
 * mix, KPI framework, a risk register, and stated assumptions. The agent runs
 * this through deepThinkJSON (draft → critique → revise) grounded in the market
 * sizing + benchmarks so targets are defensible, not invented.
 */

const phaseSchema = z.object({
  theme: z.string(),
  objectives: z.array(z.string()),
  initiatives: z.array(z.string()),
  milestones: z.array(z.string()),
});

export const strategySchema = z.object({
  positioning: z.string().describe("Sharp positioning statement"),
  growthStrategy: z.string().describe("The core growth thesis / motion"),
  plan30: phaseSchema.describe("First 30 days: foundation & quick wins"),
  plan60: phaseSchema.describe("Days 31-60: scaling what works"),
  plan90: phaseSchema.describe("Days 61-90: compounding & optimization"),
  channels: z.array(
    z.object({
      channel: z.string(),
      rationale: z.string(),
      tactics: z.array(z.string()),
    })
  ),
  kpis: z.array(
    z.object({ metric: z.string(), target: z.string(), cadence: z.string() })
  ).describe("Targets anchored to the provided market benchmarks"),
  risks: z.array(
    z.object({
      risk: z.string(),
      likelihood: z.enum(["high", "medium", "low"]),
      impact: z.enum(["high", "medium", "low"]),
      mitigation: z.string(),
    })
  ).describe("Key risks to the plan with mitigations"),
  assumptions: z.array(z.string()).describe("Assumptions the strategy depends on"),
});

export type GeneratedStrategy = z.infer<typeof strategySchema>;

export interface StrategyInputs {
  brand: BrandData;
  audience: AudienceData;
  competitors: CompetitorData;
  market: MarketData;
  goal: string;
}

/** Build the prompt fed to the agent's deepThinkJSON. */
export function strategyPrompt(inputs: StrategyInputs): string {
  const benchmarks = (inputs.market.benchmarks ?? [])
    .map((b) => `${b.metric}: ${b.value}`)
    .join("; ");
  return `Design a complete, defensible 90-day marketing strategy.

OVERALL GOAL: ${inputs.goal}

BRAND: ${inputs.brand.name} — ${inputs.brand.description}
PRODUCTS/SERVICES: ${[...inputs.brand.products, ...inputs.brand.services].map((x) => x.name).join(", ") || "n/a"}
POSITIONING SIGNALS: ${inputs.brand.voice?.positioning ?? "n/a"}

MARKET: ${inputs.market.category ?? "n/a"} — TAM ${inputs.market.tam ?? "n/a"}, growth ${inputs.market.growthRate ?? "n/a"}
BENCHMARKS (anchor KPI targets to these): ${benchmarks || "n/a"}

AUDIENCE SEGMENTS: ${inputs.audience.segments.map((s) => s.name).join(", ") || "n/a"}
TOP PAIN POINTS: ${inputs.audience.segments.flatMap((s) => s.painPoints).slice(0, 6).join("; ") || "n/a"}

COMPETITORS: ${inputs.competitors.competitors.map((c) => c.name).join(", ") || "n/a"}
MARKET GAP: ${inputs.competitors.marketGap ?? "n/a"}

Produce positioning, a growth thesis, phased 30/60/90-day plans, a prioritized channel mix
with concrete tactics, a measurable KPI framework whose targets are anchored to the market
benchmarks above, a risk register with mitigations, and the assumptions the plan rests on.`;
}

/** Merge a generated strategy into the persisted StrategyData shape. */
export function toStrategyData(s: GeneratedStrategy): StrategyData {
  return {
    positioning: s.positioning,
    growthStrategy: s.growthStrategy,
    plan30: s.plan30,
    plan60: s.plan60,
    plan90: s.plan90,
    channels: s.channels,
    kpis: s.kpis,
    risks: s.risks,
    assumptions: s.assumptions,
  };
}
