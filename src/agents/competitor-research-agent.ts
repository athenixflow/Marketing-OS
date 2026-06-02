import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { discoverCompetitors } from "../engines/brand-intelligence/competitor-discovery.js";
import type { BrandData, CompetitorData } from "../memory/schema.js";

/** Maps the competitive landscape and finds positioning whitespace. */
export class CompetitorResearchAgent extends BaseAgent {
  readonly name: AgentName = "competitor-research";
  readonly title = "Competitor Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Competitor Research Agent. You identify competitors, analyze their " +
    "positioning, and find gaps the brand can exploit.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");
    const voice = brand.voice ?? { tone: [], vocabulary: [], positioning: "", summary: "" };

    const discovery = await discoverCompetitors(brand, voice);

    const data: CompetitorData = {
      competitors: discovery.competitors,
      marketGap: discovery.marketGap,
    };
    await ctx.memory.set("competitors", data);
    ctx.set("competitors", data);

    return {
      output: data,
      summary: `Identified ${discovery.competitors.length} likely competitors; market gap: ${discovery.marketGap.slice(0, 80)}…`,
    };
  }
}
