import { z } from "zod";
import { BaseAgent } from "../core/base-agent.js";
import type { SharedContext } from "../core/context.js";
import type { AgentName, AgentResult, Task, QAReview } from "../core/types.js";
import type { ModelTier } from "../core/llm.js";
import type { BrandData, StrategyData, FinancialData } from "../memory/schema.js";

const reviewSchema = z.object({
  score: z.number().min(0).max(100).describe("Quality score against the institutional rubric"),
  pass: z.boolean(),
  issues: z.array(z.string()).describe("Concrete, required fixes (empty if pass)"),
});

const consistencySchema = z.object({
  consistent: z.boolean(),
  conflicts: z
    .array(z.object({ area: z.string(), conflict: z.string(), resolution: z.string() }))
    .describe("Cross-deliverable contradictions (positioning, numbers, audience) + fix"),
  verdict: z.string().describe("One-paragraph managing-director sign-off or hold"),
});

/**
 * The QA / Managing Director. Two roles:
 *   - review(): score a single deliverable against a rubric (used by the gate).
 *   - handle(): a final cross-deliverable consistency pass over the whole plan.
 */
export class QaAgent extends BaseAgent {
  readonly name: AgentName = "qa";
  readonly title = "QA / Managing Director Agent";
  readonly tier: ModelTier = "opus";
  readonly systemPrompt =
    "You are a Managing Director doing final review. You are exacting: you reject vague, " +
    "unsupported, generic, or internally inconsistent work, and you demand evidence and rigor.";

  /** Score one deliverable. Used by the orchestrator's QA gate. */
  async review(deliverableName: string, content: unknown, rubric: string): Promise<QAReview> {
    return this.thinkJSON(
      `Review this deliverable: "${deliverableName}".

QUALITY RUBRIC:
${rubric}

DELIVERABLE (JSON):
${JSON.stringify(content, null, 2)}

Score it 0-100 against the rubric. pass = score >= ${process.env.QA_THRESHOLD || 80}.
List concrete, required fixes (empty array only if it genuinely passes).`,
      reviewSchema,
      { temperature: 0.2, maxTokens: 2000 }
    );
  }

  /** Final consistency pass across the whole plan. */
  protected async handle(_task: Task, ctx: SharedContext): Promise<AgentResult> {
    const [brand, strategy, financials] = await Promise.all([
      ctx.memory.get<BrandData>("brand"),
      ctx.memory.get<StrategyData>("strategy"),
      ctx.memory.get<FinancialData>("financials"),
    ]);

    const result = await this.thinkJSON(
      `Audit this marketing plan for cross-deliverable consistency.

POSITIONING: ${strategy.positioning ?? "n/a"}
GROWTH STRATEGY: ${strategy.growthStrategy ?? "n/a"}
KPI TARGETS: ${(strategy.kpis ?? []).map((k) => `${k.metric}=${k.target}`).join("; ") || "n/a"}
UNIT ECONOMICS: ${financials.unitEconomics ? JSON.stringify(financials.unitEconomics) : "n/a"}
PROJECTION: ${(financials.projection ?? []).map((p) => `${p.period}: ${p.revenue} @ ${p.roas}`).join("; ") || "n/a"}
BRAND: ${brand.name} — ${brand.description}

Flag contradictions between positioning, strategy targets, and the financial model
(e.g. KPI targets that the projection can't support, audience/positioning drift, numbers
that don't reconcile). Give a managing-director verdict.`,
      consistencySchema,
      { temperature: 0.2, maxTokens: 2500 }
    );

    const md =
      `# QA / Consistency Review\n\n` +
      `**Verdict:** ${result.verdict}\n\n` +
      `**Consistent:** ${result.consistent ? "Yes" : "No"}\n\n` +
      (result.conflicts.length
        ? `## Conflicts to resolve\n` +
          result.conflicts.map((c) => `- **${c.area}** — ${c.conflict}\n  - Fix: ${c.resolution}`).join("\n")
        : "No material conflicts found.") +
      "\n";
    const file = await ctx.memory.recordAsset("qa-review.md", md);
    ctx.set("qaReview", result);

    return {
      output: { file, consistent: result.consistent, conflicts: result.conflicts.length },
      summary: `Consistency review: ${result.consistent ? "PASS" : "conflicts found"} (${result.conflicts.length} flagged) → ${file}`,
    };
  }
}
