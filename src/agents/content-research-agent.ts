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
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});

/** Researches real, current trends, topics, and hook angles to feed content creation. */
export class ContentResearchAgent extends BaseAgent {
  readonly name: AgentName = "content-research";
  readonly title = "Content Research Agent";
  readonly tier: ModelTier = "sonnet";
  readonly grounded = true;
  readonly systemPrompt =
    "You are the Content Research Agent. You surface current trends, high-potential topics, " +
    "and hook angles tailored to a specific audience and niche — grounded in what's working now.";
  readonly rubric =
    `- Trends are current and specific to this niche (not evergreen generalities).\n` +
    `- Topic ideas are high-potential and tied to audience desires.\n` +
    `- Hooks are concrete and scroll-stopping, usable verbatim as starting points.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
    ]);

    const { data: research, sources } = await this.researchJSON(
      `Research what content is working RIGHT NOW for ${brand.name}'s niche (${brand.description}).
AUDIENCE: ${audience.segments.map((s) => s.name).join(", ") || "general"}
AUDIENCE DESIRES: ${audience.segments.flatMap((s) => s.desires).slice(0, 8).join("; ") || "n/a"}
Find current trends, formats, and hook patterns performing in this space.`,
      `Produce current content trends, high-potential topic ideas, formats that perform, and
proven hook angles for this audience. Populate "sources".`,
      researchSchema,
      { temperature: 0.6, maxTokens: 4000, cache: ctx.memory.researchCache() }
    );

    // Shared on the blackboard so the Content Creation Agent can build on it.
    ctx.set("contentResearch", { ...research, sources: research.sources?.length ? research.sources : sources });

    return {
      output: research,
      summary: `Surfaced ${research.trends.length} trends and ${research.topicIdeas.length} topic ideas (${research.sources?.length || sources.length} sources).`,
    };
  }
}
