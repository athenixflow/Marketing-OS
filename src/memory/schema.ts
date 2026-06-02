/**
 * The shape of everything we persist. Each "kind" maps to one JSON file inside
 * a project's data folder. These are intentionally permissive (most fields
 * optional) so agents can fill them in incrementally across a run.
 */

export type MemoryKind =
  | "brand"
  | "audience"
  | "competitors"
  | "strategy"
  | "content-calendar"
  | "campaigns";

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

export interface AudienceData {
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

export interface CompetitorData {
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

export interface StrategyData {
  positioning?: string;
  growthStrategy?: string;
  plan30?: PhasePlan;
  plan60?: PhasePlan;
  plan90?: PhasePlan;
  channels?: Array<{ channel: string; rationale: string; tactics: string[] }>;
  kpis?: Array<{ metric: string; target: string; cadence: string }>;
  updatedAt?: string;
}

export interface PhasePlan {
  theme: string;
  objectives: string[];
  initiatives: string[];
  milestones: string[];
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
  audience: { segments: [], personas: [] } as AudienceData,
  competitors: { competitors: [] } as CompetitorData,
  strategy: {} as StrategyData,
  "content-calendar": { pillars: [], trends: [], posts: [] } as ContentCalendarData,
  campaigns: { campaigns: [] } as CampaignData,
};
