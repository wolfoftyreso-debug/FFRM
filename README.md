# AI-native Personal Phone

**An AI-native personal phone**, where every person in the contact book has
their own relationship, communication style, autonomy level and policy.

Your 46elks number is the system's **primary communication identity**:

```
Your Swedish number → 46elks → this app → relationship/context/policy → human or AI
```

- **Messages pipeline** — SMS and MMS land in one chat-style thread. Images
  are retrieved, decoded/sanitized, understood by a multimodal model, shown
  with inspectable "AI saw this" context, then run through the same
  auto-reply/escalation envelope. The composer sends text SMS or image MMS
  and can draft contact-specific image text with AI.
- **SMS pipeline** — inbound messages are triaged
  by AI (auto-reply or escalate — never fabricate) within a per-contact
  confidence envelope
- **Voice pipeline** — inbound calls are routed by call policy: ring through
  to your real phone, voicemail, AI screening or reject; voicemails are
  recorded, transcribed and summarized; missed calls notify you. Call and
  voicemail events are also persisted in the same contact conversation as
  SMS/MMS, so Johan has one chronological communication thread.
- **Relationship ontology** — each contact has a 0–100 relationship vector
  (closeness, trust, humor tolerance, call-through priority, …) proposed by
  AI from a plain-language description and tunable in Advanced relationship
- **Communication profiles** — "Teach AI how we talk": upload up to 10
  conversation screenshots; a multimodal model extracts style (not content),
  kept separate from the stored provenance screenshots
- **Assistant chat** — ask "Vem behöver uppmärksamhet?", "När pratade jag med
  Johan senast?" — the assistant answers with tools over your real data
- **Apple-native operational UI** — iOS system colors/typography, desktop
  sidebar and mobile Phone/Messages/Contacts/More tab bar, grouped lists,
  initials avatars, native message bubbles and safe-area-aware sticky composer
- **Zero-save-button Settings** — every profile/provider/call-policy field
  autosaves on blur or selection, with per-field saving spinner, persistent
  green check or inline validation error. Provider secrets remain masked.
- **Dialogue phrase variation** — the owner can add multiple openings and
  closings, one per line. AI uses at most one when contextually natural,
  varies between messages and always lets contact-specific style win.
- **Professional Contacts** — A–Z grouping, search/filter/sort, hero card with
  Call/Message/Remind actions, rich work/interests fields, and unified history
  filterable by Messages, Photos, Calls, Voicemail, Automation, Facts,
  Reminders and System (40-event pagination)
- **Contact-owned dates and automation** — birthday and Swedish name-day
  dates live on the contact card; one tap creates a yearly automation.
  Custom cron/interval/incoming-SMS rules are listed and managed under that
  contact.
- **Live surfaces** — the inbox, the open thread, Phone and every badge update
  themselves while the app is open. A lightweight change signal is polled and
  only a real change triggers a re-render, so an arriving SMS never disturbs a
  half-written reply. Hidden tabs poll nothing.
- **iPhone-style inbox semantics** — conversations sort by the latest SMS,
  MMS, call, voicemail or automation activity; opening a thread records
  `lastReadAt`; unread rows use the native blue dot/bold style. Automation
  executions become idempotent `AUTOMATION` events in the same thread and are
  explicitly marked **AUTOMATIC** in the Messages list.
- Plus: relationship memory, personal calendar, automation engine with a
  central minute-level scheduler, and a complete audit history

**Core principle:** the AI knows when it does not know. Reliability and
restraint over autonomous cleverness. The Realtime Voice pipeline (a live AI
voice agent) is deliberately not built yet — the architecture keeps that slot
open without requiring a remodel.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS on **Vercel**
- **PostgreSQL** via [Drizzle ORM](https://orm.drizzle.team) (PGlite for local dev/tests)
- **[Vercel AI SDK](https://ai-sdk.dev) + [AI Gateway](https://vercel.com/docs/ai-gateway)** — models are env-configured `provider/model` IDs
- **[46elks](https://46elks.com)** for the phone number: SMS, MMS and voice
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
AI_MODEL_FAST=poolside/laguna-s-2.1-free # explicit zero-cost tool model
AI_MODEL_SMART=poolside/laguna-s-2.1-free # explicit zero-cost reasoning model
AI_MODEL_VISION=minimax/minimax-m3    # free-tier vision model
AI_MODEL_TRANSCRIBE=fish-audio/transcribe-1 # free-tier transcription
```

No model strings are hardcoded — switch vendors by changing the env vars.

## Configure 46elks

1. Create an account at [46elks.com](https://46elks.com) and allocate a number.
2. Enter username, API password and number under **Settings → 46elks**, then
   press **Test 46elks connection**. Values are AES-256-GCM encrypted at rest.
   `ELKS46_USERNAME`, `ELKS46_PASSWORD`, `ELKS46_FROM_NUMBER` remain optional
   environment fallbacks.
3. Set `OWNER_PHONE_NUMBER` (your own phone, E.164) for escalation notifications.

## Configure Apollo

1. Create an API key in [Apollo](https://docs.apollo.io/docs/create-api-key)
   with people search and people enrichment access.
2. Enter the key under **Settings → Integrations → Apollo**, plus default
   titles, seniorities and geography. Values are encrypted at rest.
3. Open **Apollo** to search a target group, preview matches, then fetch
   phone numbers. Mobile/direct-dial numbers arrive on
   `/api/webhooks/apollo/phone?token=<WEBHOOK_TOKEN>` (requires `APP_URL`).
4. Import people with numbers as work contacts, or copy them into a broadcast.

`APOLLO_API_KEY` remains an optional environment fallback.

## Configure ElevenLabs

1. Enter API key, Voice ID and model under **Settings → ElevenLabs**.
2. Save, then **Test ElevenLabs connection** (current `/v2/voices` API).
3. Edit the Swedish voicemail and unknown-caller screening text.
4. Press **Generate both greetings**. The app stores the MP3 assets privately;
   call actions use tokenized audio URLs when `APP_URL` + `WEBHOOK_TOKEN` exist.

### Create “Min röst”

Settings contains a guided Swedish recording script covering conversational
tone, emotion, questions, names, numbers and pacing. Record 60–120 seconds,
review/re-record, explicitly confirm that it is your own voice, then create an
ElevenLabs Instant Voice Clone. The returned Voice ID is encrypted/configured
automatically as **Min röst**. Raw training audio is sent directly to
ElevenLabs and is not retained in Personal Phone.

Runtime resolver order is encrypted Settings first, environment variables
second. Keys are never rendered back to the browser or logged.

On Vercel previews, project-level **Vercel Authentication** protects the app
and the database bootstraps Owner/encryption state automatically, so no
temporary app password is needed for testing. Production still requires the
application authentication secrets. `APP_URL` automatically falls back to
Vercel's deployment URL.

## Configure the 46elks number (SMS + MMS + voice)

In the 46elks dashboard, configure your voice-enabled virtual number:

- **`sms_url`** → `https://<your-app>/api/webhooks/46elks/sms?token=<WEBHOOK_TOKEN>`
- **`mms_url`** → `https://<your-app>/api/webhooks/46elks/mms?token=<WEBHOOK_TOKEN>`
- **`voice_start`** → `https://<your-app>/api/webhooks/46elks/voice?token=<WEBHOOK_TOKEN>`

(`?token=` is only needed when `WEBHOOK_TOKEN` is set — recommended.)

The SMS webhook persists the message **before** any AI work, deduplicates on
the provider message id (46elks retries until it gets a 2xx), and returns an
empty 200 quickly. Delivery reports are posted to
`/api/webhooks/46elks/delivery` automatically when `APP_URL` is set.

The MMS webhook has the same persist-first/idempotency contract. It stores
message and provider media metadata, fetches up to four images, validates the
actual decoded type/size/pixel count, re-encodes to strip metadata and
non-image payload, and stores only sanitized bytes. A vision model receives
the image **with** relationship/recent-conversation context and returns
structured direct observations separately from cautious contextual
interpretation. Failed image understanding always escalates; it never replies
blindly. Outbound MMS accepts PNG/JPEG/GIF/WebP in the composer, safely
normalizes to JPEG and compresses below 46elks' 320 kB total payload limit.
46elks MMS has no delivery reports.

The voice webhook answers with 46elks call actions decided by your call
policy: `connect` (ring through to your real phone, with voicemail fallback
via the after-connect webhook), `record` (voicemail/screening) or reject.
Recordings are posted to `/api/webhooks/46elks/recording`, transcribed via
the AI Gateway and summarized; call ends are tracked via
`/api/webhooks/46elks/hangup`. Set `VOICE_GREETING_URL` (and optionally
`SCREEN_GREETING_URL`) to an mp3/wav URL to play a greeting before recording.

**Call policy:** configure the global rules in Settings (known contacts ring
through, unknown callers are screened, night window goes to voicemail unless
the contact's call-through priority is high enough) and override per contact
(Always ring through / daytime only / voicemail / screening / block).

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

The dispatcher also owns recovery: a database lease prevents overlapping
runs; failed automations retry after 1 and 2 minutes; stale ambiguous RUNNING
executions are stopped for manual review (never blindly resent); stale inbound
messages, MMS media, voicemails and communication-style extraction are
reclaimed. See `ARCHITECTURE.md` for exact state semantics.

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

Simulate MMS metadata (the image URL must be public HTTPS):

```bash
curl -X POST http://localhost:3000/api/webhooks/46elks/mms \
  -d "id=mTEST123&from=%2B46700000001&to=%2B46766861234" \
  -d "message=Vad tror du om den här?" \
  --data-urlencode "image=https://example.com/photo.jpg"
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
4. Point the 46elks `sms_url`, `mms_url` and `voice_start` at production.
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
