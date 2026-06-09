import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { creativeSchema, creativePrompt, type CreativePackage } from "../engines/creative/creative-engine.js";
import type { BrandData, AudienceData, StrategyData } from "../memory/schema.js";

/** Develops the creative platform: brief, visual strategy, design direction, assets. */
export class CreativeDirectorAgent extends BaseAgent {
  readonly name: AgentName = "creative-director";
  readonly title = "Creative Director Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Creative Director Agent. You turn strategy into a bold, cohesive creative " +
    "platform with precise art direction.";
  readonly rubric =
    `- The big idea is genuinely distinctive and on-strategy, not a generic tagline.\n` +
    `- Visual + design direction is specific enough for a designer to execute.\n` +
    `- Image prompts are detailed and ready to paste into a text-to-image model.\n` +
    `- Every asset ties back to the positioning and audience.`;

  protected async handle(task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, audience, strategy] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<AudienceData>("audience"),
      ctx.memory.get<StrategyData>("strategy"),
    ]);

    const campaignFocus =
      String(task.input?.campaignFocus ?? "") ||
      strategy.plan30?.theme ||
      `Launch campaign for ${brand.name}`;

    const pkg: CreativePackage = await this.deepThinkJSON(
      creativePrompt({ brand, audience, strategy, campaignFocus }),
      creativeSchema,
      { temperature: 0.7, maxTokens: 7000 }
    );

    const file = await ctx.memory.recordAsset("creative-package.json", JSON.stringify(pkg, null, 2));
    // Share image prompts so the Image Generation Agent can pick them up.
    ctx.set("imagePrompts", pkg.imagePrompts);
    ctx.set("creativePackage", pkg);

    return {
      output: pkg,
      summary: `Creative platform "${pkg.brief.bigIdea}" with ${pkg.imagePrompts.length} image prompts, ${pkg.campaignAssets.length} assets → ${file}`,
    };
  }
}
