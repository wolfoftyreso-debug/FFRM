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
- `image.test.ts` — byte-level decode/type validation, metadata stripping,
  arbitrary-byte/oversize rejection, outbound compression below MMS limit

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
- `call-policy.test.ts` (unit) — routing decisions: known/unknown callers,
  night window incl. call-through-priority piercing, per-contact overrides,
  blocking
- `envelope.test.ts` (unit) — confidence-envelope defaults per autonomy
  level, per-contact overrides, category gating of auto-replies
- `voice.test.ts` (integration) — full voice pipeline: ring-through action
  JSON, voice_start idempotency, screening for unknown callers, blocked-number
  rejection, voicemail fallback on no answer, recording → transcription →
  AI summary → owner SMS, missed-call detection + notification, completed
  calls with duration
- `mms.test.ts` (integration) — inbound MMS persist-first + provider-id
  deduplication, media metadata provenance, safe decode/re-encode, multimodal
  observation/interpretation, low-risk image auto-reply, purchase-context
  escalation, fail-closed image handling, outbound MMS persistence/provider
  id/320 kB envelope, provider-failure recovery

External providers (46elks, AI Gateway) are mocked in all automated tests via
the injection hooks in `lib/sms/provider.ts` and `lib/ai/client.ts`.

## Real-provider smoke test (manual)

Prerequisites: deployed app (or `pnpm dev` with a public tunnel), real
`AI_GATEWAY_API_KEY`, real 46elks credentials, `OWNER_PHONE_NUMBER`, and the
46elks number configured with `sms_url`, `mms_url` and `voice_start`.

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
8. **Voice — ring through**: set the number's `voice_start` to
   `/api/webhooks/46elks/voice?token=…`, call the 46elks number from a known
   contact's phone; your real phone should ring; answer and verify the call
   shows as COMPLETED with duration on the Phone view.
9. **Voice — voicemail**: call again and don't answer; leave a message.
   Verify: recording processed, transcript + AI summary on the Phone view,
   owner notification SMS received.
10. **Voice — screening**: call from an unknown number; verify it goes to
    screening/voicemail per your global policy and appears with
    "Create contact" / "Block" actions.
11. **Callback**: press "Call" on a contact — your phone rings first, then
    the contact is connected; the contact sees the system number.
12. **Inbound MMS — social**: send a harmless photo with text such as
    "Kolla vilken ful soffa jag hittade 😂". Verify one Message (no duplicate
    after webhook retry), image visible in the thread, the collapsed
    **AI saw this** panel separates direct observation from interpretation,
    and a low-risk reply is allowed only if the contact envelope permits.
13. **Inbound MMS — decision**: send a car/product photo with "Tycker du jag
    ska slå till?". Verify no answer is fabricated, the thread gets a SYSTEM
    policy event, state becomes NEEDS YOU and the owner is notified.
14. **Outbound MMS**: in the same thread attach a large JPEG/PNG, press
    **AI write text**, edit if desired and Send MMS. Verify the image is
    compressed/sanitized, provider id stored, and contact receives it from
    the same 46elks number. (MMS has no delivery reports.)
