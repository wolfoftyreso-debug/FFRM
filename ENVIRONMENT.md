# Environment variables

All variables live in `.env.local` locally and in Vercel project settings in
production. Never commit real values. See `.env.example` for a template.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Use `pglite://<dir>` (e.g. `pglite://.data/dev`) for local development without a server, or `pglite://:memory:` for throwaway runs. |
| `APP_PASSWORD` | yes | Password for the single-user login. |
| `AUTH_SECRET` | yes | ≥16 random chars; signs the session cookie (HS256). |
| `AI_GATEWAY_API_KEY` | yes* | Vercel AI Gateway key. *On Vercel you may instead rely on OIDC (`VERCEL_OIDC_TOKEN`), which the AI SDK picks up automatically. |
| `AI_MODEL_FAST` | no | Gateway model for classification/extraction/simple generation. Default `poolside/laguna-s-2.1-free` (explicit zero-cost tool model). |
| `AI_MODEL_SMART` | no | Gateway model for ambiguous conversations, style extraction and Assistant. Default `poolside/laguna-s-2.1-free`. |
| `AI_MODEL_VISION` | no | Vision-capable Gateway model for MMS understanding/drafts. Default `minimax/minimax-m3`. |
| `AI_MODEL_TRANSCRIBE` | no | Gateway transcription model for voicemail. Default `fish-audio/transcribe-1`. |
| `ELEVENLABS_API_KEY` | no | Optional environment fallback for ElevenLabs. Prefer encrypted Settings UI for private/self-hosted use. |
| `ELEVENLABS_VOICE_ID` | no | Optional ElevenLabs voice-id fallback. |
| `ELEVENLABS_MODEL_ID` | no | Optional model fallback; default `eleven_multilingual_v2`. |
| `VOICE_GREETING_URL` | no | mp3/wav URL played before voicemail recording starts. Without it, recording starts immediately. |
| `SCREEN_GREETING_URL` | no | Separate greeting for AI screening of unknown callers (falls back to `VOICE_GREETING_URL`). |
| `ELKS46_USERNAME` | yes | 46elks API username. |
| `ELKS46_PASSWORD` | yes | 46elks API password. |
| `ELKS46_FROM_NUMBER` | yes | Your SMS/MMS/voice-enabled 46elks number (E.164), the system's communication identity. |
| `OWNER_PHONE_NUMBER` | recommended | Your own phone (E.164). Escalation/missed-call/voicemail notifications go here, and it is the default ring-through target for incoming calls (can be overridden in Settings). |
| `CRON_SECRET` | yes | Shared secret for `/api/cron/dispatcher`. Vercel Cron sends it as `Authorization: Bearer <value>` automatically when set in project env. |
| `WEBHOOK_TOKEN` | recommended | When set, 46elks webhook URLs must include `?token=<value>`. |
| `APP_URL` | recommended | Public base URL (e.g. `https://agent.example.com`). Used in escalation SMS links and to request 46elks delivery reports. |
| `DEFAULT_TIMEZONE` | no | IANA timezone used when a contact has none. Default `Europe/Stockholm`. |
| `ESCALATION_PREVIEW` | no | `true` to include a short message preview in owner escalation SMS. Default `false` (privacy). |

Seed-script-only variables (optional): `SEED_OWNER_NAME`, `SEED_JOHAN_PHONE`,
`SEED_TEST_CONTACT=true` (to force the dev test contact outside development).

## Validation

`lib/env.ts` validates values lazily with zod at the point of use — a missing
variable produces a clear `Missing or invalid environment variable: X` error
from the feature that needs it, without breaking unrelated parts or the build.

## Secret hygiene

- All provider calls are server-side; the 46elks adapter imports `server-only`.
- Secrets are never logged; delivery/error logs contain provider message IDs,
  not credentials.
- 46elks and ElevenLabs credentials entered in Settings are encrypted with
  AES-256-GCM using a key derived from `AUTH_SECRET`; only masked placeholders
  return to the browser. Environment variables remain fallback values.
- **Do not rotate `AUTH_SECRET` without re-entering provider credentials.**
  Rotation intentionally makes existing encrypted provider rows undecryptable.
- ElevenLabs-generated greetings are stored privately; 46elks receives a
  tokenized `/api/public/audio/:id` URL. This requires `APP_URL` and
  `WEBHOOK_TOKEN`.
