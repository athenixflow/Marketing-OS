import { z } from "zod";
import type { BrandData, AudienceData, StrategyData } from "../../memory/schema.js";

/**
 * Creative engine: produces a creative brief, visual strategy, design direction,
 * ready-to-use image generation prompts, and campaign asset specs. The agent runs
 * this schema/prompt through deepThinkJSON (draft → critique → revise).
 */

export const creativeSchema = z.object({
  brief: z.object({
    bigIdea: z.string(),
    objective: z.string(),
    audience: z.string(),
    keyMessage: z.string(),
    toneAndManner: z.string(),
    mandatories: z.array(z.string()),
  }),
  visualStrategy: z.object({
    moodKeywords: z.array(z.string()),
    colorDirection: z.string(),
    typographyDirection: z.string(),
    photographyStyle: z.string(),
  }),
  designDirection: z.array(z.string()).describe("Concrete art-direction guidelines"),
  imagePrompts: z
    .array(
      z.object({
        title: z.string(),
        prompt: z.string().describe("A detailed, ready-to-paste text-to-image prompt"),
        negativePrompt: z.string().default(""),
        aspectRatio: z.string().default("1:1"),
      })
    )
    .describe("4-6 image generation prompts for key assets"),
  campaignAssets: z
    .array(
      z.object({
        name: z.string(),
        channel: z.string(),
        format: z.string(),
        spec: z.string().describe("What the asset shows + copy direction"),
      })
    )
    .describe("The asset set needed to run the campaign"),
});

export type CreativePackage = z.infer<typeof creativeSchema>;

export interface CreativeInputs {
  brand: BrandData;
  audience: AudienceData;
  strategy: StrategyData;
  campaignFocus: string;
}

export function creativePrompt(inputs: CreativeInputs): string {
  return `Develop a complete creative package for the campaign below.

BRAND: ${inputs.brand.name} — ${inputs.brand.description}
VOICE: ${inputs.brand.voice?.summary ?? "n/a"}
AUDIENCE: ${inputs.audience.segments.map((s) => s.name).join(", ") || "general"}
POSITIONING: ${inputs.strategy.positioning ?? "n/a"}
CAMPAIGN FOCUS: ${inputs.campaignFocus}

Deliver: a creative brief (big idea, objective, key message, tone, mandatories); a visual
strategy (mood, color, typography, photography); concrete design direction; 4-6 detailed,
ready-to-paste text-to-image prompts for hero assets; and a campaign asset list per channel.`;
}
