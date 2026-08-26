# Environment variables

All variables live in `.env.local` locally and in Vercel project settings in
production. Never commit real values. See `.env.example` for a template.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string. Use `pglite://<dir>` (e.g. `pglite://.data/dev`) for local development without a server, or `pglite://:memory:` for throwaway runs. |
| `APP_PASSWORD` | yes | Password for the single-user login. |
| `AUTH_SECRET` | yes | ≥16 random chars; signs the session cookie (HS256). |
| `AI_GATEWAY_API_KEY` | yes* | Vercel AI Gateway key. *On Vercel you may instead rely on OIDC (`VERCEL_OIDC_TOKEN`), which the AI SDK picks up automatically. |
| `AI_MODEL_FAST` | no | Gateway model ID for classification/extraction/simple generation. Default `openai/gpt-5.4-mini`. |
| `AI_MODEL_SMART` | no | Gateway model ID for ambiguous conversations/escalation analysis. Default `openai/gpt-5.4`. |
| `ELKS46_USERNAME` | yes | 46elks API username. |
| `ELKS46_PASSWORD` | yes | 46elks API password. |
| `ELKS46_FROM_NUMBER` | yes | Your 46elks number (E.164) used as SMS sender. |
| `OWNER_PHONE_NUMBER` | recommended | Your own phone (E.164). Escalation notifications go here. Without it, escalations only appear in the inbox. |
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
