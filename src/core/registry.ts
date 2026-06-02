import type { BaseAgent } from "./base-agent.js";
import type { AgentName } from "./types.js";

import { CmoAgent } from "../agents/cmo-agent.js";
import { BrandIntelligenceAgent } from "../agents/brand-intelligence-agent.js";
import { CompetitorResearchAgent } from "../agents/competitor-research-agent.js";
import { AudienceResearchAgent } from "../agents/audience-research-agent.js";
import { MarketingStrategyAgent } from "../agents/marketing-strategy-agent.js";
import { FunnelStrategyAgent } from "../agents/funnel-strategy-agent.js";
import { SeoStrategyAgent } from "../agents/seo-strategy-agent.js";
import { ContentResearchAgent } from "../agents/content-research-agent.js";
import { ContentCreationAgent } from "../agents/content-creation-agent.js";
import { CreativeDirectorAgent } from "../agents/creative-director-agent.js";
import { ImageGenerationAgent } from "../agents/image-generation-agent.js";
import { CroAgent } from "../agents/cro-agent.js";
import { CopywritingAgent } from "../agents/copywriting-agent.js";
import { AnalyticsAgent } from "../agents/analytics-agent.js";

/**
 * The registry instantiates every agent once and exposes lookup by name. This
 * is the single place where an agent is "registered" — add a new agent here
 * and route its task types in task-queue.ts to make it part of the department.
 */
export class AgentRegistry {
  private readonly agents = new Map<AgentName, BaseAgent>();
  readonly cmo: CmoAgent;

  constructor() {
    this.cmo = new CmoAgent();
    const all: BaseAgent[] = [
      this.cmo,
      new BrandIntelligenceAgent(),
      new CompetitorResearchAgent(),
      new AudienceResearchAgent(),
      new MarketingStrategyAgent(),
      new FunnelStrategyAgent(),
      new SeoStrategyAgent(),
      new ContentResearchAgent(),
      new ContentCreationAgent(),
      new CreativeDirectorAgent(),
      new ImageGenerationAgent(),
      new CroAgent(),
      new CopywritingAgent(),
      new AnalyticsAgent(),
    ];
    for (const a of all) this.agents.set(a.name, a);
  }

  get(name: AgentName): BaseAgent {
    const agent = this.agents.get(name);
    if (!agent) throw new Error(`No agent registered for "${name}"`);
    return agent;
  }

  list(): BaseAgent[] {
    return [...this.agents.values()];
  }
}
