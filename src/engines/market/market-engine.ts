import { z } from "zod";

/** Schema for web-grounded market analysis (TAM/SAM/SOM, trends, benchmarks). */
export const marketSchema = z.object({
  category: z.string().describe("The market category the brand competes in"),
  tam: z.string().describe("Total addressable market with figure + basis, or 'unverified'"),
  sam: z.string().describe("Serviceable addressable market with figure + basis"),
  som: z.string().describe("Realistic obtainable market in the near term"),
  growthRate: z.string().describe("Category growth rate (CAGR) with timeframe"),
  trends: z
    .array(z.object({ trend: z.string(), implication: z.string() }))
    .describe("Current market trends and what each means for this brand"),
  benchmarks: z
    .array(z.object({ metric: z.string(), value: z.string(), context: z.string() }))
    .describe("Industry benchmarks (e.g. typical CVR, AOV, CAC, ROAS for this category)"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  assumptions: z.array(z.string()).describe("Stated assumptions where data was unverifiable"),
  confidence: z.enum(["high", "medium", "low"]),
});

export type MarketAnalysis = z.infer<typeof marketSchema>;
