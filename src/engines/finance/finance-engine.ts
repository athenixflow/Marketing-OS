import { z } from "zod";

/** Schema for the unit-economics + budget + projection model. */
export const financeSchema = z.object({
  unitEconomics: z.object({
    estimatedAOV: z.string().describe("Average order/contract value with basis"),
    targetCAC: z.string().describe("Target customer acquisition cost"),
    estimatedLTV: z.string().describe("Estimated lifetime value (state the horizon)"),
    ltvToCac: z.string().describe("LTV:CAC ratio"),
    paybackMonths: z.string().describe("CAC payback period in months"),
    grossMargin: z.string().describe("Assumed gross margin %"),
  }),
  budgetAllocation: z
    .array(z.object({ channel: z.string(), monthlyBudget: z.string(), rationale: z.string() }))
    .describe("Budget split across the strategy's channels"),
  projection: z
    .array(z.object({ period: z.string(), spend: z.string(), revenue: z.string(), roas: z.string() }))
    .describe("Month 1/2/3 (or 30/60/90) spend → revenue → ROAS projection"),
  sensitivity: z
    .array(z.object({ scenario: z.string(), assumption: z.string(), outcome: z.string() }))
    .describe("Best/base/worst-case scenarios with the assumption that drives each"),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  assumptions: z.array(z.string()).describe("Every assumption the model rests on"),
  confidence: z.enum(["high", "medium", "low"]),
});

export type FinancialModel = z.infer<typeof financeSchema>;
