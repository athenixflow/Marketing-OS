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
  const options: Options = {
    model: MODEL_IDS[opts.tier ?? "sonnet"],
    systemPrompt: opts.system,
    maxTurns: 1,
    tools: [], // pure text generation — no file/bash/web access
    permissionMode: "bypassPermissions",
  };

  try {
    for await (const message of query({ prompt, options })) {
      if (message.type === "result") {
        if (message.subtype === "success") return message.result.trim();
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

Respond with ONLY a single JSON object that conforms to this JSON Schema. Do not
include any prose, explanation, or Markdown code fences — output raw JSON only.

JSON Schema:
${jsonSchema}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await complete(
      attempt === 0
        ? base
        : `${base}

Your previous response could not be parsed/validated. Error:
${lastErr instanceof Error ? lastErr.message : String(lastErr)}
Return corrected raw JSON only.`,
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
    `completeJSON: model did not return valid JSON for the schema after 2 attempts. ` +
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
