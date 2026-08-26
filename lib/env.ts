import { z } from "zod";

/**
 * Environment access with validation. Values are read lazily so that builds
 * and tests work without a full production environment; anything that
 * actually needs a variable fails loudly at the point of use.
 */

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_PASSWORD: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  AI_GATEWAY_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default("minimax/minimax-m3"),
  AI_MODEL_SMART: z.string().default("minimax/minimax-m3"),
  AI_MODEL_VISION: z.string().default("minimax/minimax-m3"),
  AI_MODEL_TRANSCRIBE: z.string().default("fish-audio/transcribe-1"),
  VOICE_GREETING_URL: z.string().optional(),
  SCREEN_GREETING_URL: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().optional(),
  ELKS46_USERNAME: z.string().min(1),
  ELKS46_PASSWORD: z.string().min(1),
  ELKS46_FROM_NUMBER: z.string().min(1),
  OWNER_PHONE_NUMBER: z.string().optional(),
  CRON_SECRET: z.string().min(1),
  WEBHOOK_TOKEN: z.string().optional(),
  APP_URL: z.string().optional(),
  DEFAULT_TIMEZONE: z.string().default("Europe/Stockholm"),
  ESCALATION_PREVIEW: z.string().default("false"),
});

type Env = z.infer<typeof envSchema>;

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const shape = envSchema.shape[key];
  const parsed = shape.safeParse(process.env[key]);
  if (!parsed.success || parsed.data === undefined || parsed.data === "") {
    throw new Error(`Missing or invalid environment variable: ${key}`);
  }
  return parsed.data as NonNullable<Env[K]>;
}

export function optionalEnv<K extends keyof Env>(key: K): Env[K] | undefined {
  const shape = envSchema.shape[key];
  const parsed = shape.safeParse(process.env[key]);
  if (!parsed.success || parsed.data === "") return undefined;
  return parsed.data;
}

export function defaultTimezone(): string {
  return optionalEnv("DEFAULT_TIMEZONE") ?? "Europe/Stockholm";
}

export function escalationPreviewEnabled(): boolean {
  return optionalEnv("ESCALATION_PREVIEW") === "true";
}

/** Public deployment URL with automatic Vercel preview fallback. */
export function appUrl(): string | undefined {
  const explicit = optionalEnv("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const vercelUrl =
    process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//, "")}` : undefined;
}
