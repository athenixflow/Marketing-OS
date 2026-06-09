import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { planSchema, contentPlanPrompt } from "../engines/content/content-engine.js";
import type { BrandData, AudienceData, StrategyData, ContentCalendarData } from "../memory/schema.js";

/** Builds content pillars + a dated 2-week content calendar. */
export class ContentCreationAgent extends BaseAgent {
  readonly name: AgentName = "content-creation";
  readonly title = "Content Creation Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Content Creation Agent. You turn strategy and research into concrete content " +
    "pillars and a publish-ready calendar.";
  readonly rubric =
    `- Pillars are distinct, on-strategy, and cover the funnel.\n` +
    `- Each post has a channel-native format and a genuinely scroll-stopping hook.\n` +
    `- The calendar is balanced across pillars/channels and dated sensibly.\n` +
    `- Every post brief includes a clear CTA tied to the funnel.`;

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, strategy] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<StrategyData>("strategy"),
    ]);

    const startDate = new Date().toISOString().slice(0, 10);
    const plan = await this.deepThinkJSON(
      contentPlanPrompt({ brand, audience, strategy, startDate }),
      planSchema,
      { temperature: 0.6, maxTokens: 7000 }
    );

    const data: ContentCalendarData = {
      pillars: plan.pillars,
      trends: plan.trends,
      posts: plan.posts,
    };
    await ctx.memory.set("content-calendar", data);
    ctx.set("contentCalendar", data);

    return {
      output: data,
      summary: `Created ${plan.pillars.length} pillars and a calendar with ${plan.posts.length} posts.`,
    };
  }
}
