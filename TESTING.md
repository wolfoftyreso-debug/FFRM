# Testing

## Commands

```bash
pnpm test        # unit + integration (vitest, in-memory PGlite)
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm build       # next build
```

## What is covered

### Unit tests (`tests/unit/`)
- `phone.test.ts` — E.164 normalization (national formats, 00-prefix, junk)
- `recurrence.test.ts` — birthday recurrence incl. Feb 29 and DST, one-shot
  dates, intervals, the cron parser, occurrence-key semantics
- `policy.test.ts` — the auto-reply policy gate (autonomy levels,
  conversation states, risk, confidence, requiresUser)
- `schemas.test.ts` — structured AI output validation (valid + invalid)

### Integration tests (`tests/integration/`, real SQL via in-memory PGlite)
- `webhook.test.ts` — inbound 46elks webhook: persistence before AI,
  provider-id deduplication across retries, contact resolution, unknown
  senders, phone normalization, malformed payloads
- `send-message.test.ts` — outbound service: record-first persistence,
  provider id storage, failure handling, recipient validation
- `automation.test.ts` — GENERATE_SMS execution with full audit trail,
  occurrence idempotency (same occurrence can never send twice), draft
  queueing at autonomy 2–3, contact autonomy capping, dispatcher end-to-end
  (due detection, nextRunAt advancement, re-run safety)
- `inbound.test.ts` — AI conversation loop: low-risk auto-reply, escalation
  with deduplicated owner notification, autonomy blocking, USER-takeover
  silence, concurrent processing claims, AI-failure escalation, memory/
  commitment extraction with provenance
- `no-contact.test.ts` — one reminder per inactivity episode, re-arming after
  new interaction, never-contacted contacts

External providers (46elks, AI Gateway) are mocked in all automated tests via
the injection hooks in `lib/sms/provider.ts` and `lib/ai/client.ts`.

## Real-provider smoke test (manual)

Prerequisites: deployed app (or `pnpm dev` with a public tunnel), real
`AI_GATEWAY_API_KEY`, real 46elks credentials, `OWNER_PHONE_NUMBER`, and the
46elks SMS webhook pointed at `/api/webhooks/46elks/sms?token=<WEBHOOK_TOKEN>`.

1. **Outbound + AI**: create a contact with your test phone; open the seeded
   *"Johan test"* automation → **Run now**. Expect an AI-written SMS on the
   phone; verify the provider message id in the automation's execution log
   and the message in the contact timeline.
2. **Inbound low-risk**: reply "Tack!" from the phone (contact autonomy must
   be 4). Expect an automatic AI reply and an `AI_TRIAGE` entry in Activity.
3. **Inbound escalation**: reply "Ska vi ses på torsdag kl 19?". Expect NO
   reply to the contact, an SMS notification to `OWNER_PHONE_NUMBER`, and the
   conversation under **NEEDS YOU** in the inbox.
4. **Takeover**: open the conversation → **Take over** → send a manual reply.
   Verify it arrives and that further inbound messages produce no AI replies
   until **Return to AI**.
5. **Scheduler**: set the contact's birthday to tomorrow, enable the birthday
   automation, and confirm the greeting fires at the configured time exactly
   once (check the execution log's occurrence key), with the next run
   scheduled for next year.
6. **Delivery reports**: with `APP_URL` set, verify sent messages progress
   from SENT to DELIVERED in the conversation view.
7. **Health**: Settings → System health shows recent cron/webhook/AI/SMS
   heartbeats and zero unexpected failed jobs.
