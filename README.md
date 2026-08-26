# Personal Relationship Agent

A small, reliable, AI-powered personal relationship agent. It remembers the
people in your life — birthdays, promises, conversation history, preferences —
and, when explicitly permitted, performs simple relationship maintenance
automatically over SMS.

This is **not** a sales CRM. It is a private tool that combines:

- relationship memory (facts, commitments, timelines)
- a personal calendar (birthdays, reminders, scheduled automations)
- an SMS inbox with AI triage (auto-reply or escalate — never fabricate)
- an automation engine with a central minute-level scheduler
- a complete audit history of everything the system does

**Core principle:** the AI knows when it does not know. Low-risk social
messages can be answered automatically (only at the highest autonomy level);
everything else escalates to you via SMS and the inbox.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS on **Vercel**
- **PostgreSQL** via [Drizzle ORM](https://orm.drizzle.team) (PGlite for local dev/tests)
- **[Vercel AI SDK](https://ai-sdk.dev) + [AI Gateway](https://vercel.com/docs/ai-gateway)** — models are env-configured `provider/model` IDs
- **[46elks](https://46elks.com)** for outbound SMS and inbound SMS webhooks
- **Vercel Cron** — one dispatcher every minute; the database decides what is due

## Origin

The concept is inspired by the open-source personal CRM
[benkaiser/mob-mcp-crm](https://github.com/benkaiser/mob-mcp-crm) (contacts,
birthdays, reminders, relationship memory, timelines). This codebase is a
**from-scratch rebuild** for a Vercel-native stack — no code was copied from
the donor repository, only data-model concepts. The donor is licensed under
FSL-1.1-MIT (which permits internal/private use and converts to MIT two years
after release); since no FSL-licensed code is included here, this repository
carries no obligations from that license. See `ARCHITECTURE.md` for the full
audit.

## Install

```bash
pnpm install
cp .env.example .env.local   # fill in values (see ENVIRONMENT.md)
```

## Configure PostgreSQL

Production: create a Postgres database (e.g. Neon via the Vercel Marketplace)
and set `DATABASE_URL`.

Local development without a Postgres server: set
`DATABASE_URL=pglite://.data/dev` — an in-process Postgres (PGlite) stored in
`.data/`.

Apply migrations and seed the owner user (+ the dev test contact "Johan"):

```bash
pnpm db:migrate
pnpm db:seed
```

## Configure Vercel AI Gateway

1. Create an AI Gateway API key in the Vercel dashboard (or rely on OIDC on Vercel).
2. Set `AI_GATEWAY_API_KEY`.
3. Choose models (any Gateway `provider/model` IDs):

```
AI_MODEL_FAST=openai/gpt-5.4-mini    # classification, extraction, simple messages
AI_MODEL_SMART=openai/gpt-5.4        # ambiguous conversations, escalation analysis
```

No model strings are hardcoded — switch vendors by changing the env vars.

## Configure 46elks

1. Create an account at [46elks.com](https://46elks.com) and allocate a number.
2. Set `ELKS46_USERNAME`, `ELKS46_PASSWORD`, `ELKS46_FROM_NUMBER`.
3. Set `OWNER_PHONE_NUMBER` (your own phone, E.164) for escalation notifications.

## Configure the incoming SMS webhook

In the 46elks dashboard, set your number's SMS URL to:

```
https://<your-app>/api/webhooks/46elks/sms?token=<WEBHOOK_TOKEN>
```

(`?token=` is only needed when `WEBHOOK_TOKEN` is set — recommended.)

The webhook persists the message **before** any AI work, deduplicates on the
provider message id (46elks retries until it gets a 2xx), and returns an empty
200 quickly. Delivery reports are posted to
`/api/webhooks/46elks/delivery` automatically when `APP_URL` is set.

## Configure Vercel Cron

`vercel.json` already declares the dispatcher:

```json
{ "crons": [{ "path": "/api/cron/dispatcher", "schedule": "* * * * *" }] }
```

Set `CRON_SECRET` in the project env; Vercel sends it as
`Authorization: Bearer <CRON_SECRET>`. Per-minute cron requires the Vercel Pro
plan (on Hobby, use a lower frequency or an external pinger).

There is **one** cron for the entire system. Automations live in the database
with a `nextRunAt`; the dispatcher executes what is due and computes the next
occurrence. Executions are idempotent via a unique
`(automationId, occurrenceKey)` constraint — a repeated invocation can never
send the same SMS twice.

## Run locally

```bash
pnpm dev
# open http://localhost:3000 and sign in with APP_PASSWORD
```

Simulate an incoming SMS locally:

```bash
curl -X POST http://localhost:3000/api/webhooks/46elks/sms \
  -d "id=sTEST123&from=%2B46700000001&to=%2B46766861234&message=Tack!"
```

Trigger the dispatcher locally:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dispatcher
```

## Deploy to Vercel

1. Push the repository and import it in Vercel.
2. Add all environment variables from `.env.example` (see `ENVIRONMENT.md`).
3. Deploy. Run migrations against the production database:
   `DATABASE_URL=<prod> pnpm db:migrate && DATABASE_URL=<prod> pnpm db:seed`
4. Point the 46elks SMS webhook at the production URL.
5. Verify Settings → System health after the first minute (cron heartbeat).

## The Johan test (end-to-end verification)

1. Create contact **Johan** with your test phone number (or run `pnpm db:seed`
   in dev and edit the number).
2. Open the seeded automation *"Johan test: skicka vänligt SMS"* → **Run now**.
3. Verify: AI generates the message → SMS is sent through 46elks → provider id
   is stored → execution appears in the automation history → Johan's timeline
   updates.
4. Reply from Johan's phone with something trivial ("Tack!") → the AI answers
   automatically (requires autonomy level 4 on the contact).
5. Reply with something requiring you ("Ska vi ses på torsdag kl 19?") → the
   conversation is **escalated**: no reply is fabricated, you get an SMS
   notification, and the conversation shows **NEEDS YOU** in the inbox.
6. Open the conversation → **Take over** → reply manually → the AI stays
   disabled until you press **Return to AI**.

See `TESTING.md` for automated tests and the real-provider smoke-test script.

## Documentation

- `ARCHITECTURE.md` — system design, donor-repo audit, data model
- `ENVIRONMENT.md` — every environment variable explained
- `TESTING.md` — test strategy, commands, smoke-test procedure
