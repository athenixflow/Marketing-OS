import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

/**
 * LLM layer built on the Claude Agent SDK.
 *
 * Why the Agent SDK instead of a raw API client: `query()` authenticates the
 * same way Claude Code does. When ANTHROPIC_API_KEY is unset, it uses the
 * credentials from the user's logged-in Claude Code session (their Pro/Max
 * subscription) — so this runs with no API key to manage. If a key IS set, the
 * spawned subprocess inherits it and uses that instead.
 *
 * We disable all tools and cap turns: each call is a single, pure text
 * generation. completeJSON() asks for schema-shaped JSON and validates it,
 * since the Agent SDK has no native structured-output mode.
 */

export type ModelTier = "opus" | "sonnet" | "haiku";

const MODEL_IDS: Record<ModelTier, string> = {
  opus: process.env.MODEL_OPUS || "claude-opus-4-8",
  sonnet: process.env.MODEL_SONNET || "claude-sonnet-4-6",
  haiku: process.env.MODEL_HAIKU || "claude-haiku-4-5",
};

/**
 * The subscription path needs no key, so we can't meaningfully pre-check auth.
 * Always returns true; the first query() surfaces auth problems with a clear
 * message (see LLMNotConfiguredError).
 */
export function isConfigured(): boolean {
  return true;
}

export interface CompleteOpts {
  tier?: ModelTier;
  system?: string;
  /** Kept for signature compatibility; the Agent SDK doesn't expose these. */
  temperature?: number;
  maxTokens?: number;
}

/** Free-form text completion via a single Agent SDK turn (no tools). */
export async function complete(prompt: string, opts: CompleteOpts = {}): Promise<string> {
  return runQuery(prompt, {
    model: MODEL_IDS[opts.tier ?? "sonnet"],
    systemPrompt: opts.system,
    maxTurns: 1,
    tools: [], // pure text generation — no file/bash/web access
    permissionMode: "bypassPermissions",
  });
}

export interface Source {
  title: string;
  url: string;
}

export interface ResearchResult {
  /** The findings narrative produced from real web research. */
  text: string;
  /** Citations parsed from the model's SOURCES: block. */
  sources: Source[];
  /** False when web tools were unavailable and we fell back to model-only. */
  grounded: boolean;
}

/** Whether web grounding is enabled (default on; RESEARCH_WEB=0 disables). */
export function researchEnabled(): boolean {
  return !/^(0|false|no)$/i.test(process.env.RESEARCH_WEB ?? "1");
}

/**
 * Web-grounded research: lets the model use WebSearch/WebFetch to gather real,
 * current evidence, then return findings followed by a SOURCES: list. Falls back
 * to an ungrounded completion (empty sources, grounded=false) if web tools are
 * disabled or unavailable — callers should lower confidence accordingly.
 */
export async function research(prompt: string, opts: CompleteOpts = {}): Promise<ResearchResult> {
  const instruction = `${prompt}

Use web search to gather CURRENT, verifiable evidence. Prefer reputable, primary
sources. After your findings, end your response with a section formatted exactly:

SOURCES:
- <title> | <url>
- <title> | <url>

Only list sources you actually used. If you could not verify a claim, say so.`;

  if (researchEnabled()) {
    try {
      const text = await runQuery(instruction, {
        model: MODEL_IDS[opts.tier ?? "sonnet"],
        systemPrompt: opts.system,
        maxTurns: 8,
        tools: ["WebSearch", "WebFetch"],
        allowedTools: ["WebSearch", "WebFetch"],
        permissionMode: "bypassPermissions",
      });
      return { text, sources: parseSources(text), grounded: true };
    } catch (err) {
      if (err instanceof LLMLimitError) throw err; // limits must surface
      // Web tools unavailable/blocked — degrade gracefully to model-only.
    }
  }

  const text = await complete(prompt, opts);
  return { text, sources: [], grounded: false };
}

/** Free-form critique of a draft against a rubric (used by deepThinkJSON). */
export function critique(draft: string, rubric: string, opts: CompleteOpts = {}): Promise<string> {
  return complete(
    `Critically review the DRAFT below against the QUALITY RUBRIC. Be a demanding
institutional reviewer: name concrete weaknesses, vague or unsupported claims,
missing rigor, and anything that wouldn't survive a partner/board review. Output a
terse, numbered list of specific fixes — no praise, no preamble.

QUALITY RUBRIC:
${rubric}

DRAFT:
${draft}`,
    { ...opts, temperature: 0.3 }
  );
}

/** Shared Agent SDK call: streams to the terminal result message. */
async function runQuery(prompt: string, options: Options): Promise<string> {
  try {
    for await (const message of query({ prompt, options })) {
      if (message.type === "result") {
        if (message.subtype === "success") {
          const text = message.result.trim();
          // The subscription can surface a usage/session-limit notice as ordinary
          // assistant text on a "success" result. Never let that get parsed or
          // persisted as a real answer — fail loudly so callers can retry/stop.
          if (LIMIT_NOTICE.test(text)) throw new LLMLimitError(text);
          return text;
        }
        // Non-success result → surface the error text.
        throw new Error(
          `Claude Agent SDK returned "${message.subtype}"` +
            ("result" in message && message.result ? `: ${message.result}` : "")
        );
      }
    }
    throw new Error("Claude Agent SDK produced no result message.");
  } catch (err: any) {
    throw wrapSdkError(err);
  }
}

/** Extract "- title | url" lines from the model's SOURCES: block. */
function parseSources(text: string): Source[] {
  const idx = text.search(/SOURCES:/i);
  if (idx === -1) return [];
  const block = text.slice(idx);
  const sources: Source[] = [];
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s*(.+?)\s*\|\s*(https?:\/\/\S+)/);
    if (m) sources.push({ title: m[1].trim(), url: m[2].trim() });
  }
  return sources;
}

/**
 * Structured completion. Appends the schema as JSON Schema with a strict
 * "JSON only" instruction, then parses + validates the reply. Retries once,
 * feeding the validation error back into the prompt.
 */
export async function completeJSON<S extends z.ZodTypeAny>(
  prompt: string,
  schema: S,
  opts: CompleteOpts = {}
): Promise<z.infer<S>> {
  const jsonSchema = JSON.stringify(zodToJsonSchema(schema, { target: "jsonSchema7" }));
  const base = `${prompt}

Respond with ONLY a single JSON object that conforms to this JSON Schema. Output
raw JSON — no prose, no explanation, no Markdown code fences.

Match every field's type EXACTLY:
- A field typed "array" must be a JSON array using square brackets [ ... ].
  NEVER represent a list as an object keyed by name.
- Include every required field; use [] or "" rather than omitting a field.

JSON Schema:
${jsonSchema}`;

  const MAX_ATTEMPTS = 4;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reply = await complete(
      attempt === 0
        ? base
        : `${base}

Your previous response was INVALID. Validation error:
${lastErr instanceof Error ? lastErr.message : String(lastErr)}

Fix exactly that problem and return corrected raw JSON only. Remember: array-typed
fields must be JSON arrays [ ... ], never objects.`,
      opts
    );

    try {
      const parsed = JSON.parse(stripFences(reply));
      return schema.parse(parsed);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `completeJSON: model did not return valid JSON for the schema after ${MAX_ATTEMPTS} attempts. ` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

/** Remove ```json ... ``` fences and surrounding noise if the model adds them. */
function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let body = fenced ? fenced[1] : text;
  body = body.trim();
  // If there's leading/trailing prose, grab the outermost JSON object/array.
  const start = body.search(/[{[]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (start > 0 && end >= start) body = body.slice(start, end + 1);
  return body;
}

function wrapSdkError(err: any): Error {
  const msg = String(err?.message ?? err);
  if (/auth|login|credential|unauthor|api[_ ]?key|401|403/i.test(msg)) {
    return new LLMNotConfiguredError(msg);
  }
  return err instanceof Error ? err : new Error(msg);
}

/** Matches subscription usage/session/rate-limit notices returned as text. */
const LIMIT_NOTICE = /^(you've|you have) (hit|reached) your (session|usage|rate|weekly|daily) limit/i;

export class LLMLimitError extends Error {
  constructor(detail: string) {
    super(`Claude usage/session limit reached: ${detail}`);
    this.name = "LLMLimitError";
  }
}

export class LLMNotConfiguredError extends Error {
  constructor(detail?: string) {
    super(
      "Could not authenticate with Claude. Run `claude` once to log in with your " +
        "subscription, or set ANTHROPIC_API_KEY in .env." +
        (detail ? `\nDetail: ${detail}` : "")
    );
    this.name = "LLMNotConfiguredError";
  }
}
