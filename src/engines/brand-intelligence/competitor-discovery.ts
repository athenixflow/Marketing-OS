import { z } from "zod";

/**
 * Schema for web-grounded competitive intelligence. The agent uses researchJSON
 * to find real competitors and cite sources, rather than guessing from memory.
 */
export const discoverySchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().default(""),
        positioning: z.string().default(""),
        strengths: z.array(z.string()).default([]),
        weaknesses: z.array(z.string()).default([]),
        differentiators: z
          .array(z.string())
          .default([])
          .describe("How OUR brand could differentiate from this competitor"),
      })
    )
    .describe("5-8 real, verifiable competitors"),
  marketGap: z.string().describe("An underserved gap our brand could own"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  assumptions: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type Discovery = z.infer<typeof discoverySchema>;
