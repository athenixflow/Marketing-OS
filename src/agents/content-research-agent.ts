import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { BrandData, AudienceData } from "../memory/schema.js";

const researchSchema = z.object({
  trends: z.array(z.string()).describe("Current, relevant content trends in this niche"),
  topicIdeas: z.array(z.string()).describe("High-potential content topics"),
  formatsThatWork: z.array(z.string()),
  hooks: z.array(z.string()).describe("Proven hook angles for this audience"),
});

/** Researches trends, topics, and hook angles to feed content creation. */
export class ContentResearchAgent extends BaseAgent {
  readonly name: AgentName = "content-research";
  readonly title = "Content Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Content Research Agent. You surface current trends, high-potential topics, " +
    "and hook angles tailored to a specific audience and niche.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
    ]);

    const research = await this.thinkJSON(
      `Research content opportunities for ${brand.name} (${brand.description}).
AUDIENCE: ${audience.segments.map((s) => s.name).join(", ") || "general"}
AUDIENCE DESIRES: ${audience.segments.flatMap((s) => s.desires).slice(0, 8).join("; ") || "n/a"}

Identify current content trends, high-potential topic ideas, formats that perform in this
niche, and proven hook angles.`,
      researchSchema,
      { temperature: 0.7 }
    );

    // Shared on the blackboard so the Content Creation Agent can build on it.
    ctx.set("contentResearch", research);

    return {
      output: research,
      summary: `Surfaced ${research.trends.length} trends and ${research.topicIdeas.length} topic ideas.`,
    };
  }
}
