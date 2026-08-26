# Architecture

## Overview

The 46elks number is the system's primary communication identity. Four
pipelines share one conversation/relationship core:

```
                    ┌── SMS pipeline        /api/webhooks/46elks/sms
46ELKS NUMBER ──────┼── MMS/media pipeline  /api/webhooks/46elks/mms
                    ├── Voice pipeline      /api/webhooks/46elks/voice (+ after-connect, recording, hangup)
                    └── Realtime Voice      (deliberately NOT built — slot reserved)
                              ↓
                     Conversation / Call core (persist FIRST, idempotent)
                              ↓
                     Relationship context (vector + communication profile + memory)
                              ↓
                        Policy engine (confidence envelope, call policy, autonomy)
                              ↓
                     Vercel AI Gateway (FAST / SMART / VISION / TRANSCRIBE)
                              ↓
              human (ring through / escalate / draft)  or  AI (low-risk auto-reply)
```

The central scheduler is unchanged: one Vercel Cron per minute →
`/api/cron/dispatcher` → due automations from the database, plus fallback
reprocessing of unclaimed inbound SMS/MMS and unprocessed voicemail recordings.

## Reliability and recovery model

Database state — never process memory — is the source of truth:

- **Inbound SMS/MMS:** unique provider id; expiring processing lease;
  `processedAt` is written only after reply/escalation/extraction completes.
  Generic failures release the lease for cron retry (max 3); final failure
  escalates. A provider failure after an approved auto-reply escalates instead
  of silently marking the message handled.
- **MMS:** Message + all provider media metadata + interaction timestamps are
  one transaction. Per-asset leases and attempt counters reclaim stale
  `PROCESSING`; failed fetch/vision work stays unprocessed until cron retries,
  then fails closed to escalation.
- **Outbound SMS/MMS:** local PENDING row first. Explicit provider failure is
  FAILED. If the provider accepted but local confirmation failed, status is
  `SENT_UNKNOWN`; automatic resend is blocked to prevent duplicate texts.
  Cron converts stale PENDING rows to this visible ambiguous state.
- **Conversations:** partial unique indexes guarantee one OPEN thread per
  contact or unknown peer even under concurrent webhooks.
- **Voice:** duplicate `voice_start` returns the persisted disposition and
  original routing target (policy changes cannot alter an in-flight retry).
  `after-connect` is state-idempotent; missed-call notification is atomically
  deduplicated.
- **Voicemail:** recording-processing lease + attempts; Gateway/fetch failures
  retry, then notify without transcript. `processedAt` means DB + owner
  notification handled.
- **Automations:** a cron lease prevents overlapping dispatchers. Explicit
  failures retry at 1m/2m in the same permanent execution row. A stale RUNNING
  row is *not* resent (side effect ambiguous); it becomes terminal FAILED for
  manual review. Disabled automations never retry.
- **Style screenshots:** sanitized provenance is persisted with status,
  attempt count and error. Extraction rebuilds the contact profile from the
  latest 10 stored screenshots; cron retries failed/stale jobs and the contact
  UI exposes status + manual retry.
- **Cron fallbacks:** due automations, execution retries, stale RUNNING
  recovery, stale outbound ambiguity, inbound messages, MMS assets, voicemail
  recordings and style extraction all converge through the dispatcher.

All persisted errors are stripped of ANSI/control sequences before rendering.

## Unified conversation/message model

`Conversation` is contact-centric. One thread contains `Message` rows from
SMS, MMS and internal system/AI events; voice calls and voicemails are call
records linked to the same `conversationId` **and** emit idempotent
`VOICE_CALL` / `VOICEMAIL` system Messages into that exact thread.

```
CONTACT → CONVERSATION
          ├── Message(channel=SMS,    contentType=TEXT)
          ├── Message(channel=MMS,    contentType=IMAGE|TEXT_AND_IMAGE)
          │      └── MediaAsset(s)
          ├── Message(channel=VOICE_CALL, contentType=SYSTEM)
          ├── Message(channel=VOICEMAIL,  contentType=SYSTEM)
          └── Message(channel=SYSTEM, contentType=SYSTEM)
```

`channel` and `contentType` are open strings so future VOICE/VIDEO/FILE/
LOCATION/AUDIO require no table redesign. GPS-location MMS is therefore not
blocked by the schema, but has no specialized V1 UI.

### Inbox ordering, unread and automation visibility

- `Conversation.lastMessageAt` is updated by every SMS/MMS plus idempotent
  call, voicemail, AI and `AUTOMATION` event. Messages.app ordering is simply
  newest activity first — cron executions cannot disappear into a separate
  admin log.
- Opening `/messages/:id` POSTs an authenticated read receipt and stores
  `lastReadAt`. A conversation is unread iff
  `lastMessageAt > lastReadAt` (or it has never been opened). Inbox rows use
  the iOS blue dot/bold treatment and an Unread segment.
- Every contact automation attempt writes a unique SYSTEM Message with
  `channel=AUTOMATION`, `sender=AUTOMATION` and execution-attempt idempotency
  key. The inbox and thread render **AUTOMATIC** explicitly.
- Birthday and name-day month/day are contact-owned recurring dates.
  `BIRTHDAY` / `NAME_DAY` recurrence is timezone-aware and contact automation
  shortcuts preconfigure the matching yearly trigger.

## MMS/media pipeline

1. **`mms_url`** (`/api/webhooks/46elks/mms`) receives form-urlencoded
   `id/from/to/message/image…image4`. The `Message` and all provider-media
   metadata are persisted first. The same unique
   `(provider,direction,providerMessageId)` key as SMS makes webhook retries
   harmless. The route returns empty 200 immediately.
2. Each image URL is retrieved only over HTTPS (46elks URLs use Basic auth),
   bounded at 10 MB, decoded with Sharp with a 40 MP pixel limit, then
   re-encoded as PNG/JPEG. This verifies actual bytes, rejects malformed/
   unsupported media, strips metadata and embedded non-image payload. It is
   honest deterministic sanitization rather than a fictional "virus scan".
3. `IMAGE_UNDERSTANDING` uses `AI_MODEL_VISION` through Gateway with the
   image + contact + relationship vector + communication profile + recent
   conversation + MMS text. Structured output strictly separates:
   - **observation:** caption, generic objects, exact visible text,
     non-identifying people description, scene, safety;
   - **contextual interpretation:** cautious relationship/conversation-based
     interpretation, explicitly not a fact.
   Prompts forbid guessing model/engine/mileage/value, identity, location,
   contractual meaning or other unsupported facts.
4. The stored observation is appended to the current message for ordinary
   triage. The **same confidence envelope** decides AUTO_REPLY/ESCALATE.
   A meme/small talk may auto-reply; purchase advice, contracts, money or
   failed image understanding escalates. The thread gets an inspectable
   SYSTEM event with decision + `policyMatch`.
5. The Messages UI serves sanitized media through the authenticated
   stable `MediaAsset.storageUrl` through the authenticated `/api/media/:id`
   route and exposes a collapsed **AI saw this** panel:
   direct observation, visible text, contextual interpretation, confidence
   and model — auditability without clutter.
6. Outbound composer: text-only sends SMS; image sends MMS. Images are
   re-encoded/compressed so the base64 data URL + text stays below 46elks'
   320 kB total limit. Message + media are persisted before the provider
   call; failure remains visible. **AI write text** runs the selected image
   and contact context through the vision model and fills the editable
   composer draft before send.

## Voice pipeline

1. **voice_start** (`/api/webhooks/46elks/voice`): call persisted (unique
   provider call id → webhook retries are idempotent), then the **call policy
   engine** (`lib/voice/policy.ts`, pure and unit-tested) decides:
   - `RING_THROUGH` → `{"connect": <owner phone>, "timeout": 25, next: after-connect}`
   - `VOICEMAIL` / `SCREEN` → optional greeting `play`, then `record`
   - `REJECT` → `{"hangup": "reject"}`
2. **after-connect**: `result=success` → call CONNECTED, hang up;
   `result=failed` (no answer/busy) → voicemail actions.
3. **recording**: WAV URL persisted first; then (waitUntil + cron fallback)
   the recording is fetched with API credentials, transcribed via
   `gateway.transcription(AI_MODEL_TRANSCRIBE)`, summarized/classified by the
   fast model, and the owner is notified by SMS. Transcription failure never
   loses the voicemail — the owner is notified regardless.
4. **hangup**: final state and duration; unanswered calls become MISSED and
   notify the owner (their phone only shows the 46elks number, so the SMS
   restores who actually called).

Outbound calls: "Call" in the UI POSTs `/a1/calls` — 46elks rings the owner's
real phone first, then connects to the contact. The contact always sees the
system number.

### Call policy

Global policy (Settings → `users.callPolicy`): known contacts / unknown
callers dispositions, night window with night action, and a
`nightPriorityThreshold`. Per-contact `callPolicy` overrides (always ring
through, daytime only, voicemail, screen, block), and `blocked_numbers`
rejects before anything else. The relationship vector's
`callThroughPriority` pierces the night rule for the inner circle — the
relationship ontology drives the phone, not just message tone.

## Relationship ontology

Contacts carry a **relationship vector** (0–100): personalCloseness,
professionalRelevance, formality, trust, humorTolerance, sensitiveTopicAccess,
autonomousReplyFreedom, proactiveContactDesired, callThroughPriority,
privacySensitivity. "Colleague" and "friend" can both be true at once.

The user writes one sentence ("En av mina närmaste vänner, men vi jobbar
också ihop ibland"); the AI proposes label + vector + confidence envelope
(`lib/ai/relationship.ts`, structured output); everything is tunable under
Advanced relationship. The vector feeds the AI context and the call policy.

## Confidence envelope

Per-contact rules per action category (SMALL_TALK, JOKES,
GENERIC_LIFE_QUESTIONS, KNOWN_SHARED_TOPICS, SUGGEST_MEETING,
AGREE_SPECIFIC_MEETING, MONEY_OR_PAYMENT, PRIVATE_INFORMATION,
FACTUAL_COMMITMENT, WORK_DECISION, CONFLICT_OR_EMOTION), each AUTO /
ESCALATE / BLOCK. Defaults derive from the autonomy level (social categories
AUTO only at level 4; MONEY_OR_PAYMENT is BLOCK by default).

Triage decisions include a `policyMatch` category ("pick the most restrictive
that applies"); the code-level gate (`canAutoReply`) then enforces
`envelope[policyMatch] === AUTO` **in addition to** the existing state/
autonomy/risk/confidence checks. The model proposes, the envelope disposes.

## Communication profiles ("Teach AI how we talk")

Up to 10 conversation screenshots per contact are stored as provenance
(`contact_media`) and run once through a multimodal Gateway model
(`lib/ai/style.ts`) that extracts a structured `CommunicationProfile` —
distinguishing **how the owner writes to this contact** (ownerStyle) from
**how the contact writes back** (contactStyle), plus topics, recurring
expressions and initiation patterns. Only the structured profile enters
message-generation context; raw screenshots are never re-sent per message.

Response context composition:

```
GLOBAL OWNER STYLE + RELATIONSHIP VECTOR + COMMUNICATION PROFILE
+ RECENT CONVERSATION + CURRENT SITUATION + AUTONOMY/ENVELOPE POLICY
= RESPONSE CONTEXT   (lib/ai/context.ts)
```

## Assistant chat

`/chat` is the owner's assistant: a tool loop (AI SDK `generateText` + tools,
max 6 steps) over real data — contact search, who-needs-attention, upcoming
events, recent calls, commitments, conversation history, reminder creation,
system health. Non-streaming by design (simple, robust); history persists in
`assistant_messages`.

## Messaging overview

```
                        ┌──────────────────────────────┐
  Vercel Cron (1/min) ─▶│ /api/cron/dispatcher         │
                        │  · due automations (DB)      │
                        │  · idempotent executions     │
                        │  · stale inbound fallback    │
                        │  · unprocessed voicemails    │
                        └──────────┬───────────────────┘
                                   │
 46elks ──POST──▶ /api/webhooks/46elks/{sms,mms}           Web UI (Next.js)
   ▲              · persist FIRST (unique provider id)     · Chat / Phone / Messages /
   │              · resolve contact (E.164)                  Calendar / People /
   │              · sanitize/understand image (MMS)          Automations / Activity
   │              · waitUntil → AI triage
   │                                   │                     · server actions
   │                                   ▼
   │              lib/inbound.ts  ── triage (AI Gateway) ── policy gate + envelope
   │                    │                                       │
   └── lib/sms ◀── AUTO_REPLY (low risk, autonomy 4)            │
        send-message    └────────── ESCALATE ──▶ owner SMS + Messages NEEDS YOU
```

## Donor repository audit (benkaiser/mob-mcp-crm)

The donor is an Express 5 + better-sqlite3 + EJS + Preact application built
primarily as an MCP server, licensed FSL-1.1-MIT. Audit outcome:

### KEEP (as concepts)
- Rich contact model (identity, work info, birthday handling, soft deletes)
- Relationship memory: notes, life events, timelines
- Reminders with recurrence (`one_time/weekly/monthly/yearly`)
- Audit log for user-visible traceability
- Service-layer pattern (business logic separated from transport)

### REBUILD (implemented fresh here)
- Everything, in practice: the donor runtime (long-lived Express process,
  SQLite on local disk, EJS-rendered auth pages, Preact SPA) is incompatible
  with a serverless Vercel deployment. All concepts above were re-implemented
  on Next.js + Postgres/Drizzle.

### REMOVE (not carried over)
- OAuth 2.0 PKCE server, MCP session infrastructure, API tokens
- "Forgetful mode" (ephemeral sessions)
- Import pipelines (Monica, Google CSV, vCard), export, web push, email
- Gifts, debts, tags/groups, docs-site, beans issue tracking

### License note
No FSL-licensed code was copied — only non-copyrightable schema/product
concepts. This repository therefore carries no FSL obligations. If donor code
is ever vendored in later, the FSL-1.1-MIT terms (internal use permitted,
MIT after two years per release) must be documented at that point.

## Data model (PostgreSQL, Drizzle)

- `users` — the owner (single row today; all data keyed for future multi-user)
- `contacts` — identity + relationship profile (cadence, style, autonomy 0–4,
  birthday, E.164 phone unique per user, `lastInteractionAt`)
- `contact_facts` — AI/user-extracted memory with provenance
  (`sourceMessageId`, confidence, SUGGESTED → CONFIRMED/DISMISSED)
- `conversations` — per-contact channel state:
  `aiControlState ∈ {AI, USER, PAUSED, ESCALATED}`, escalation dedupe
- `messages` — every SMS/MMS/system event; channel + contentType; unique `(provider, direction,
  providerMessageId)` is the inbound idempotency key; `processedAt` claims
  triage processing exactly once
- `media_assets` — sanitized bytes + dimensions + provider provenance +
  stable private `storageUrl` + structured observation/interpretation, model,
  confidence, status/error
- `automations` — trigger (type + config JSON) → action (type + config JSON),
  `nextRunAt`, autonomy level
- `automation_executions` — permanent execution log; **unique
  `(automationId, occurrenceKey)`** guarantees at-most-once side effects
- `commitments` — detected promises (madeBy USER/CONTACT, due date, status)
- `reminders` — reminders, tasks, calendar events, and AI **drafts** awaiting
  approval (kind = REMINDER/TASK/EVENT/DRAFT)
- `activity_log` — global audit trail; also drives contact timelines
- `ai_calls` — model, tokens, duration, purpose for every AI request
- `system_state` — operational heartbeats (last cron/webhook/AI/SMS)

The calendar is **composed at read time** from automations (`nextRunAt`),
executions, reminders, commitments and birthdays — no separate event table to
keep in sync.

## Scheduler

One Vercel Cron (`* * * * *`) → `/api/cron/dispatcher` (Bearer `CRON_SECRET`):

1. `SELECT automations WHERE enabled AND nextRunAt <= now()`
2. For each: compute an **occurrence key** (`birthday-2026-03-15`,
   `nocontact-<lastInteractionAt>`, `t-<iso>`), insert the execution row with
   `ON CONFLICT DO NOTHING` — losing the insert means another run already
   handled the occurrence.
3. Run the action, record result/decision/AI usage, advance `nextRunAt`
   (timezone-aware; birthdays handle Feb 29; a small built-in cron parser
   backs the advanced CRON trigger).
4. Reprocess inbound messages whose post-webhook processing never completed
   (`processedAt IS NULL` and older than 90s) — communication is never lost.

`NO_CONTACT_FOR` is re-evaluated hourly; its occurrence key embeds
`lastInteractionAt`, so one reminder fires per inactivity episode and re-arms
automatically after new contact.

## AI layer

- All calls go through the **Vercel AI Gateway** using plain
  `provider/model` strings from `AI_MODEL_FAST` / `AI_MODEL_SMART`.
- `lib/ai/client.ts` is the single entry point: structured generation uses
  `generateText` + `Output.object(zod)` and **re-validates** output — invalid
  model output is never executed. Every call is usage-logged to `ai_calls`.
- **Two-tier triage**: the fast model classifies every inbound SMS; only
  ambiguous AUTO_REPLY decisions (confidence < 0.8) are re-run on the smart
  model. ESCALATE from the fast model is accepted directly — escalation is
  always safe.
- **Policy gate** (`lib/ai/policy.ts`): the model proposes, the code disposes.
  Auto-reply requires conversation state AI + contact autonomy 4 + decision
  AUTO_REPLY + risk LOW + confidence ≥ 0.85 + non-empty reply. Everything
  else escalates.
- Escalation topics (money, legal, medical, scheduling, commitments, facts
  the AI cannot know, …) are enforced in the prompt **and** through the risk/
  requiresUser gate.

## Autonomy levels

```
0 MEMORY_ONLY           AI only remembers
1 REMIND                AI may create reminders
2 DRAFT                 AI drafts; user sends manually
3 APPROVAL              AI drafts and queues; user approves (Today view)
4 AUTONOMOUS_LOW_RISK   AI may send predefined low-risk messages itself
```

The effective level for an automation is `min(automation, contact)` — the
stricter setting always wins.

## SMS layer

- `MessagingProvider` interface with a single implementation
  (`Elks46MessagingProvider`); tests inject a mock.
- Outbound: the message row is persisted **before** the provider call, then
  updated with the provider id (SENT) or the error (FAILED).
- Inbound: persisted and deduplicated before any processing; triage runs via
  `waitUntil` after the (empty-bodied) 200 response, with the cron fallback
  as the safety net.
- Owner notifications (escalations) are separate SYSTEM messages, never part
  of contact conversations, deduplicated per escalation episode, and exclude
  message content unless `ESCALATION_PREVIEW=true`.

## Security

- Single-user password login (`APP_PASSWORD`) with an HMAC-signed session
  cookie (`AUTH_SECRET`); `proxy.ts` guards every route except `/login`,
  `/api/webhooks/*` (optional `WEBHOOK_TOKEN`) and `/api/cron/*`
  (`CRON_SECRET`).
- All provider credentials are server-only (`server-only` import in the 46elks
  adapter); nothing sensitive reaches the client bundle.
- All webhook/API input is zod-validated; phone numbers are normalized to
  E.164 before storage or matching.

## Deliberately not built (V1)

Multi-channel (email/WhatsApp/…), MCP server, calendar-provider integrations,
contact enrichment, vector search, multi-agent orchestration, billing, native
apps. The schema avoids blocking these (e.g. `conversations.channel`), but no
speculative code exists.
