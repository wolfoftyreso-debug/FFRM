# Architecture

## Overview

```
                        ┌──────────────────────────────┐
  Vercel Cron (1/min) ─▶│ /api/cron/dispatcher         │
                        │  · due automations (DB)      │
                        │  · idempotent executions     │
                        │  · stale inbound fallback    │
                        └──────────┬───────────────────┘
                                   │
 46elks ──POST──▶ /api/webhooks/46elks/sms                 Web UI (Next.js)
   ▲              · persist FIRST (unique provider id)     · Today / Inbox /
   │              · resolve contact (E.164)                  Calendar / People /
   │              · waitUntil → AI triage                    Automations / Activity
   │                                   │                     · server actions
   │                                   ▼
   │              lib/inbound.ts  ── triage (AI Gateway) ── policy gate
   │                    │                                       │
   └── lib/sms ◀── AUTO_REPLY (low risk, autonomy 4)            │
        send-message    └────────── ESCALATE ──▶ owner SMS + inbox NEEDS YOU
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
- `messages` — every SMS in/out; unique `(provider, direction,
  providerMessageId)` is the inbound idempotency key; `processedAt` claims
  triage processing exactly once
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
