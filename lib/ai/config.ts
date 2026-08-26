import { optionalEnv } from "@/lib/env";

/**
 * Central model configuration. Model IDs are Vercel AI Gateway IDs in
 * "provider/model" form and are configured via environment variables —
 * never hardcode model strings elsewhere in the application.
 *
 * FAST_MODEL: classification, extraction, trivial generation.
 * SMART_MODEL: ambiguous conversations, nuanced tone, escalation analysis.
 */

export function fastModel(): string {
  return optionalEnv("AI_MODEL_FAST") ?? "openai/gpt-5.4-mini";
}

export function smartModel(): string {
  return optionalEnv("AI_MODEL_SMART") ?? "openai/gpt-5.4";
}

/** Confidence below which fast-model triage is re-run with the smart model. */
export const TRIAGE_SMART_FALLBACK_THRESHOLD = 0.8;
