import { z } from "zod";
import { completeJSON, complete } from "../../core/llm.js";
import type { BrandData, AudienceData, StrategyData, ContentCalendarData } from "../../memory/schema.js";

/**
 * Content engine: research + trends -> content pillars -> a dated calendar,
 * plus generators for individual assets (captions, scripts, blog posts).
 */

export const planSchema = z.object({
  trends: z.array(z.string()).describe("Relevant, current content trends for this niche"),
  pillars: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      themes: z.array(z.string()),
    })
  ).describe("3-5 content pillars"),
  posts: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD"),
        channel: z.string(),
        pillar: z.string(),
        format: z.string().describe("e.g. reel, carousel, blog, email, thread"),
        hook: z.string(),
        brief: z.string().describe("What the piece covers + the CTA"),
      })
    )
    .describe("A 2-week calendar, multiple posts per week across channels"),
});

export type ContentPlan = z.infer<typeof planSchema>;

export interface ContentInputs {
  brand: BrandData;
  audience: AudienceData;
  strategy: StrategyData;
  startDate: string; // YYYY-MM-DD
}

export function contentPlanPrompt(inputs: ContentInputs): string {
  const channels = inputs.strategy.channels?.map((c) => c.channel).join(", ") || "Instagram, LinkedIn, Blog, Email";
  return `Create a content plan for the brand below.

BRAND: ${inputs.brand.name} — ${inputs.brand.description}
VOICE: ${inputs.brand.voice?.summary ?? "n/a"}
AUDIENCE: ${inputs.audience.segments.map((s) => s.name).join(", ") || "general"}
PRIORITY CHANNELS: ${channels}
CALENDAR START DATE: ${inputs.startDate}

Identify current content trends, define content pillars, and build a 2-week calendar starting
on the start date with multiple posts per week mapped to pillars and channels. Each post needs
a scroll-stopping hook and a brief with its CTA.`;
}

/** Generate a single social caption from a calendar post brief. */
export function generateCaption(brand: BrandData, post: ContentCalendarData["posts"][number]): Promise<string> {
  return complete(
    `Write a ${post.channel} caption for this post.
HOOK: ${post.hook}
BRIEF: ${post.brief}
Match the brand voice: ${brand.voice?.summary ?? "clear, friendly, confident"}.
Include relevant hashtags and a clear CTA.`,
    {
      tier: "sonnet",
      system: "You are an expert social copywriter who writes native, high-engagement captions.",
      temperature: 0.8,
    }
  );
}

/** Generate a short-form video script from a calendar post brief. */
export function generateScript(brand: BrandData, post: ContentCalendarData["posts"][number]): Promise<string> {
  return complete(
    `Write a 30-45 second short-form video script for ${post.channel}.
HOOK: ${post.hook}
BRIEF: ${post.brief}
Brand voice: ${brand.voice?.summary ?? "energetic and clear"}.
Format as: [HOOK] [BEAT 1] [BEAT 2] [BEAT 3] [CTA], with on-screen text cues.`,
    {
      tier: "sonnet",
      system: "You are a short-form video scriptwriter optimizing for retention.",
      temperature: 0.8,
    }
  );
}

/** Generate a full blog post from a pillar/topic. */
export function generateBlog(brand: BrandData, topic: string): Promise<string> {
  return complete(
    `Write a 700-900 word SEO-friendly blog post for ${brand.name} on: "${topic}".
Brand voice: ${brand.voice?.summary ?? "authoritative and helpful"}.
Include an H1, structured H2 sections, a short intro, a conclusion, and a CTA. Return Markdown.`,
    {
      tier: "sonnet",
      system: "You are an SEO content writer who writes genuinely useful, well-structured articles.",
      temperature: 0.7,
      maxTokens: 4000,
    }
  );
}
