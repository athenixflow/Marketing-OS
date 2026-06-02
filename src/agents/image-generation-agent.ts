import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { CreativePackage } from "../engines/creative/creative-engine.js";

/**
 * Produces ready-to-use text-to-image prompts as a deliverable. It does not
 * call an image API by default (no key required) — it packages the Creative
 * Director's prompts into a clean, paste-ready file. Hook up an image model
 * later behind this same agent if desired.
 */
export class ImageGenerationAgent extends BaseAgent {
  readonly name: AgentName = "image-generation";
  readonly title = "Image Generation Agent";
  readonly tier: ModelTier = "haiku";
  readonly systemPrompt =
    "You are the Image Generation Agent. You refine creative direction into precise, " +
    "production-ready text-to-image prompts.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const pkg = ctx.get<CreativePackage>("creativePackage");
    const prompts = pkg?.imagePrompts ?? ctx.get<CreativePackage["imagePrompts"]>("imagePrompts") ?? [];

    if (prompts.length === 0) {
      return { output: null, summary: "No image prompts available (run Creative Director first)." };
    }

    const md =
      `# Image Generation Prompts\n\n` +
      prompts
        .map(
          (p, i) =>
            `## ${i + 1}. ${p.title}\n` +
            `**Aspect ratio:** ${p.aspectRatio}\n\n` +
            `**Prompt:**\n\n\`\`\`\n${p.prompt}\n\`\`\`\n` +
            (p.negativePrompt ? `\n**Negative prompt:** ${p.negativePrompt}\n` : "")
        )
        .join("\n");

    const file = await ctx.memory.recordAsset("image-prompts.md", md);

    return {
      output: { file, count: prompts.length },
      summary: `Packaged ${prompts.length} ready-to-use image prompts → ${file}`,
    };
  }
}
