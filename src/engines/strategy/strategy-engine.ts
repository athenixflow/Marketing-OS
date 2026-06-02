import { z } from "zod";
import { completeJSON } from "../../core/llm.js";
import type { BrandData, AudienceData, CompetitorData, StrategyData } from "../../memory/schema.js";

/**
 * Strategy engine: turns brand + audience + competitor knowledge into a full
 * marketing strategy — positioning, 30/60/90-day plans, channel mix, growth
 * levers, and a KPI framework.
 */

const phaseSchema = z.object({
  theme: z.string(),
  objectives: z.array(z.string()),
  initiatives: z.array(z.string()),
  milestones: z.array(z.string()),
});

const strategySchema = z.object({
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
  ),
});

export type GeneratedStrategy = z.infer<typeof strategySchema>;

export interface StrategyInputs {
  brand: BrandData;
  audience: AudienceData;
  competitors: CompetitorData;
  goal: string;
}

export async function generateStrategy(inputs: StrategyInputs): Promise<GeneratedStrategy> {
  const prompt = `Design a complete 90-day marketing strategy.

OVERALL GOAL: ${inputs.goal}

BRAND: ${inputs.brand.name} — ${inputs.brand.description}
PRODUCTS/SERVICES: ${[...inputs.brand.products, ...inputs.brand.services].map((x) => x.name).join(", ") || "n/a"}
POSITIONING SIGNALS: ${inputs.brand.voice?.positioning ?? "n/a"}

AUDIENCE SEGMENTS: ${inputs.audience.segments.map((s) => s.name).join(", ") || "n/a"}
TOP PAIN POINTS: ${inputs.audience.segments.flatMap((s) => s.painPoints).slice(0, 6).join("; ") || "n/a"}

COMPETITORS: ${inputs.competitors.competitors.map((c) => c.name).join(", ") || "n/a"}
MARKET GAP: ${inputs.competitors.marketGap ?? "n/a"}

Produce positioning, a growth thesis, phased 30/60/90-day plans, a prioritized channel mix
with concrete tactics, and a measurable KPI framework with realistic targets and reporting cadence.`;

  return completeJSON(prompt, strategySchema, {
    tier: "opus",
    system:
      "You are a seasoned CMO and growth strategist. You produce specific, actionable, " +
      "sequenced strategy — never generic platitudes.",
    temperature: 0.5,
    maxTokens: 6000,
  });
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
  };
}
