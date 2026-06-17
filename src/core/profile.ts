/**
 * Performance profiles. `MOS_PROFILE` selects how much parallelism, research
 * depth, and fast-mode inference the system uses — without changing any agent's
 * prompts, schemas, model tiers, or the draft→critique→revise quality loop.
 *
 *  - deep:     today's original behavior (no fast mode, concurrency 3, 8 turns).
 *  - balanced: DEFAULT. Same reasoning as deep, just faster — fast mode on,
 *              concurrency 5, full research depth.
 *  - fast:     opt-in. Adds a mild research-depth trim and more concurrency.
 *
 * Individual knobs can still be overridden via env (MOS_CONCURRENCY, etc.).
 */

export type ProfileName = "deep" | "balanced" | "fast";

export interface Profile {
  name: ProfileName;
  /** Max independent agents running at once. */
  concurrency: number;
  /** Max web-browse turns a research() call may take. */
  researchTurns: number;
  /** Request the same model with faster output (Agent SDK fast mode). */
  fastMode: boolean;
}

const PROFILES: Record<ProfileName, Omit<Profile, "name">> = {
  deep: { concurrency: 3, researchTurns: 8, fastMode: false },
  balanced: { concurrency: 5, researchTurns: 8, fastMode: true },
  fast: { concurrency: 6, researchTurns: 4, fastMode: true },
};

export function getProfile(): Profile {
  const raw = (process.env.MOS_PROFILE || "balanced").toLowerCase();
  const name: ProfileName = raw in PROFILES ? (raw as ProfileName) : "balanced";
  const base = PROFILES[name];

  // Per-knob env overrides win over the profile.
  const concurrency = process.env.MOS_CONCURRENCY
    ? Math.max(1, Number(process.env.MOS_CONCURRENCY))
    : base.concurrency;
  const researchTurns = process.env.RESEARCH_TURNS
    ? Math.max(1, Number(process.env.RESEARCH_TURNS))
    : base.researchTurns;
  const fastMode = process.env.FAST_MODE
    ? !/^(0|false|no)$/i.test(process.env.FAST_MODE)
    : base.fastMode;

  return { name, concurrency, researchTurns, fastMode };
}
