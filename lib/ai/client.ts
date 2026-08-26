import { generateText, Output } from "ai";
import type { z } from "zod";
import { getDb } from "@/lib/db";
import { aiCalls } from "@/lib/db/schema";
import { touchSystemState } from "@/lib/system-state";

export interface AiUsage {
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
}

export interface StructuredResult<T> {
  output: T;
  usage: AiUsage;
}

export interface TextResult {
  text: string;
  usage: AiUsage;
}

type StructuredCall = <T>(args: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  purpose: string;
}) => Promise<StructuredResult<T>>;

type TextCall = (args: {
  model: string;
  system: string;
  prompt: string;
  purpose: string;
}) => Promise<TextResult>;

let structuredOverride: StructuredCall | null = null;
let textOverride: TextCall | null = null;

/** Used by tests to mock the model. */
export function setAiForTests(
  structured: StructuredCall | null,
  text: TextCall | null,
): void {
  structuredOverride = structured;
  textOverride = text;
}

async function recordCall(
  purpose: string,
  model: string,
  usage: AiUsage,
  ok: boolean,
  error?: string,
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(aiCalls).values({
      purpose,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      durationMs: usage.durationMs,
      ok,
      error,
    });
    if (ok) await touchSystemState("lastAiAt");
  } catch {
    // Usage accounting must never break the main flow.
  }
}

/**
 * Structured generation through the Vercel AI Gateway. Output is validated
 * against the given zod schema — invalid model output throws and is never
 * executed.
 */
export async function generateStructured<T>(args: {
  model: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  purpose: string;
}): Promise<StructuredResult<T>> {
  if (structuredOverride) return structuredOverride(args);
  const started = Date.now();
  try {
    const result = await generateText({
      model: args.model,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
    });
    const usage: AiUsage = {
      model: args.model,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      durationMs: Date.now() - started,
    };
    await recordCall(args.purpose, args.model, usage, true);
    // Re-validate: never trust unvalidated model output.
    const output = args.schema.parse(result.output);
    return { output, usage };
  } catch (err) {
    const usage: AiUsage = {
      model: args.model,
      inputTokens: null,
      outputTokens: null,
      durationMs: Date.now() - started,
    };
    await recordCall(
      args.purpose,
      args.model,
      usage,
      false,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

/** Plain text generation through the Vercel AI Gateway. */
export async function generatePlainText(args: {
  model: string;
  system: string;
  prompt: string;
  purpose: string;
}): Promise<TextResult> {
  if (textOverride) return textOverride(args);
  const started = Date.now();
  try {
    const result = await generateText({
      model: args.model,
      system: args.system,
      prompt: args.prompt,
    });
    const usage: AiUsage = {
      model: args.model,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      durationMs: Date.now() - started,
    };
    await recordCall(args.purpose, args.model, usage, true);
    return { text: result.text.trim(), usage };
  } catch (err) {
    await recordCall(
      args.purpose,
      args.model,
      {
        model: args.model,
        inputTokens: null,
        outputTokens: null,
        durationMs: Date.now() - started,
      },
      false,
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
