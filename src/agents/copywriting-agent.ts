import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import { generateCaption, generateScript, generateBlog } from "../engines/content/content-engine.js";
import type { BrandData, ContentCalendarData } from "../memory/schema.js";

/**
 * Writes finished copy from the calendar: captions + a video script for the
 * first posts, plus one full blog post from the first content pillar.
 */
export class CopywritingAgent extends BaseAgent {
  readonly name: AgentName = "copywriting";
  readonly title = "Copywriting Agent";
  readonly tier: ModelTier = "sonnet";
  readonly systemPrompt =
    "You are the Copywriting Agent. You write on-brand, conversion-focused copy that matches " +
    "the brand voice precisely.";

  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const brand = await ctx.memory.get<BrandData>("brand");
    const calendar = await ctx.memory.get<ContentCalendarData>("content-calendar");

    if (calendar.posts.length === 0) {
      return { output: null, summary: "No calendar posts to write copy for." };
    }

    const samplePosts = calendar.posts.slice(0, 3);
    const captions: string[] = [];
    for (const post of samplePosts) {
      captions.push(`### ${post.date} — ${post.channel} (${post.format})\n${await generateCaption(brand, post)}`);
    }

    const script = await generateScript(brand, samplePosts[0]);
    const blogTopic = calendar.pillars[0]?.name ?? brand.products[0]?.name ?? brand.name ?? "our solution";
    const blog = await generateBlog(brand, blogTopic);

    const captionsFile = await ctx.memory.recordAsset(
      "copy-captions.md",
      `# Sample Captions\n\n${captions.join("\n\n")}`
    );
    const scriptFile = await ctx.memory.recordAsset(
      "copy-video-script.md",
      `# Video Script — ${samplePosts[0].hook}\n\n${script}`
    );
    const blogFile = await ctx.memory.recordAsset("copy-blog-post.md", blog);

    return {
      output: { captionsFile, scriptFile, blogFile },
      summary: `Wrote ${captions.length} captions, 1 video script, and a blog post on "${blogTopic}".`,
    };
  }
}
