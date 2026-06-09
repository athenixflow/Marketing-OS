/**
 * The shape of everything we persist. Each "kind" maps to one JSON file inside
 * a project's data folder. These are intentionally permissive (most fields
 * optional) so agents can fill them in incrementally across a run.
 */

export type MemoryKind =
  | "brand"
  | "market"
  | "audience"
  | "competitors"
  | "strategy"
  | "financials"
  | "content-calendar"
  | "campaigns";

/** A cited source used to ground a claim. */
export interface Source {
  title: string;
  url: string;
}

/** Mixed into research-bearing records for institutional traceability. */
export interface Provenance {
  sources: Source[];
  assumptions: string[];
  confidence: "high" | "medium" | "low";
}

export interface BrandData {
  url?: string;
  name?: string;
  tagline?: string;
  description?: string;
  products: Array<{ name: string; description?: string; price?: string }>;
  services: Array<{ name: string; description?: string }>;
  offers: Array<{ name: string; details?: string }>;
  ctas: Array<{ text: string; location?: string }>;
  voice?: {
    tone: string[];
    vocabulary: string[];
    positioning: string;
    summary: string;
  };
  pagesAnalyzed?: string[];
  updatedAt?: string;
}

/** Market sizing + trends + benchmarks, web-sourced. */
export interface MarketData extends Partial<Provenance> {
  category?: string;
  tam?: string;
  sam?: string;
  som?: string;
  growthRate?: string;
  trends: Array<{ trend: string; implication: string }>;
  benchmarks: Array<{ metric: string; value: string; context: string }>;
  updatedAt?: string;
}

export interface AudienceData extends Partial<Provenance> {
  segments: Array<{
    name: string;
    description: string;
    painPoints: string[];
    desires: string[];
    objections: string[];
    channels: string[];
  }>;
  personas: Array<{
    name: string;
    demographic: string;
    psychographic: string;
    buyingTriggers: string[];
  }>;
  updatedAt?: string;
}

export interface CompetitorData extends Partial<Provenance> {
  competitors: Array<{
    name: string;
    url?: string;
    positioning?: string;
    strengths: string[];
    weaknesses: string[];
    differentiators: string[];
  }>;
  marketGap?: string;
  updatedAt?: string;
}

export interface RiskItem {
  risk: string;
  likelihood: "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  mitigation: string;
}

export interface StrategyData {
  positioning?: string;
  growthStrategy?: string;
  plan30?: PhasePlan;
  plan60?: PhasePlan;
  plan90?: PhasePlan;
  channels?: Array<{ channel: string; rationale: string; tactics: string[] }>;
  kpis?: Array<{ metric: string; target: string; cadence: string }>;
  risks?: RiskItem[];
  assumptions?: string[];
  updatedAt?: string;
}

export interface PhasePlan {
  theme: string;
  objectives: string[];
  initiatives: string[];
  milestones: string[];
}

/** Unit economics + budget + projection, with stated assumptions + sensitivity. */
export interface FinancialData extends Partial<Provenance> {
  unitEconomics?: {
    estimatedAOV: string;
    targetCAC: string;
    estimatedLTV: string;
    ltvToCac: string;
    paybackMonths: string;
    grossMargin: string;
  };
  budgetAllocation: Array<{ channel: string; monthlyBudget: string; rationale: string }>;
  projection: Array<{ period: string; spend: string; revenue: string; roas: string }>;
  sensitivity: Array<{ scenario: string; assumption: string; outcome: string }>;
  updatedAt?: string;
}

export interface ContentCalendarData {
  pillars: Array<{ name: string; description: string; themes: string[] }>;
  trends: string[];
  posts: Array<{
    date: string;
    channel: string;
    pillar: string;
    format: string;
    hook: string;
    brief: string;
  }>;
  updatedAt?: string;
}

export interface CampaignData {
  campaigns: Array<{
    name: string;
    objective: string;
    channels: string[];
    startedAt: string;
    assets: string[];
    notes?: string;
  }>;
  updatedAt?: string;
}

/** Default empty value for each memory kind. */
export const EMPTY: Record<MemoryKind, unknown> = {
  brand: { products: [], services: [], offers: [], ctas: [] } as BrandData,
  market: { trends: [], benchmarks: [], sources: [], assumptions: [], confidence: "low" } as MarketData,
  audience: { segments: [], personas: [], sources: [], assumptions: [], confidence: "low" } as AudienceData,
  competitors: { competitors: [], sources: [], assumptions: [], confidence: "low" } as CompetitorData,
  strategy: { risks: [], assumptions: [] } as StrategyData,
  financials: { budgetAllocation: [], projection: [], sensitivity: [], sources: [], assumptions: [], confidence: "low" } as FinancialData,
  "content-calendar": { pillars: [], trends: [], posts: [] } as ContentCalendarData,
  campaigns: { campaigns: [] } as CampaignData,
};
