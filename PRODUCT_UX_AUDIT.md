# Product Intelligence & UX Audit

## Product model

**WHO:** one private owner who uses one Swedish number across phone, SMS and
MMS.  
**WHY:** stay responsive and remember relationships without surrendering
judgment.  
**WHAT:** contacts, conversations, calls, media, commitments, dates,
automations and provider configuration.  
**FREQUENCY:** Messages/Phone daily; Contacts weekly; Automation/Settings
occasionally; webhooks/cron continuously.  
**CRITICALITY:** external sends, call routing, provider secrets and autonomous
actions are high-risk.  
**ENVIRONMENT:** phone-first under interruption; desktop for setup, history and
automation forensics.

## Surface map

| Surface | Purpose | Primary action | Frequency | Risk | Quality |
|---|---|---|---|---|---|
| Messages | exception-aware communication inbox | open/respond | daily | high | strong |
| Thread | unified SMS/MMS/call/AI chronology | reply/take over | daily | critical | strong, refined |
| Phone | recents/missed/voicemail | review/call back | daily | high | strong |
| Contacts | relationship directory | find/open person | daily | medium | strong |
| Contact | relationship memory and history | call/message | weekly | high | dense |
| Assistant | natural-language command surface | ask/approve | weekly | medium | moderate |
| Calendar | future obligations | scan/add reminder | weekly | medium | moderate |
| Automations | delegated work | configure/review | occasional | critical | moderate |
| Settings | profile/integrations/policy/health | configure/test | rare | critical | refined |

## Mobbin research evidence

### Inbox scanning

Reviewed ten communication inboxes across consumer, productivity and
operational products. Strong convergence:

- one row = avatar, identity, one-line preview, timestamp;
- unread uses weight + a small non-color-only signal;
- exceptional work is separated from ordinary chronology;
- search is near the list; filters do not erase search context.

Examples: [Slack unread/mentions hierarchy](https://mobbin.com/screens/8e65f9c9-5b08-4303-8a56-ef403676143e),
[OpenPhone multi-select inbox](https://mobbin.com/screens/a9945b1d-5665-4759-a6f5-3e3c4ec697db),
[LINE chat list](https://mobbin.com/screens/f57da636-4b10-447f-b1d3-1c9ff3404417),
[Quo clean inbox](https://mobbin.com/screens/3340f1e5-9219-4d2b-aae2-4c7f533c5487).

**Applied:** search-preserving segments, specific empty states, humanized
automation previews.  
**Preserved:** escalation-first ordering and explicit AUTOMATIC state.

### Conversation detail

Reviewed Messages, Telegram, Quo and multi-media social threads. Convergence:

- compact sticky identity header and explicit back action;
- transcript owns the screen; secondary contact context moves away on mobile;
- one persistent bottom composer;
- send/delivery/error states stay adjacent to the affected message;
- closed/unavailable states disable composition instead of relying on copy.

Examples: [Apple Messages thread](https://mobbin.com/screens/a4708b67-37de-471e-8b24-268d66750595),
[Quo scheduled/failed message states](https://mobbin.com/screens/c49dccfa-fdf3-41e2-b1ac-63d30f848e0c),
[Telegram multi-media thread](https://mobbin.com/screens/015bba5b-a3bc-488d-91ee-916a9544cccd).

**Applied:** mobile back action, closed-thread composer guard, pending AI-control
actions.  
**Preserved:** auditable AI/system events and “AI saw this”.

### Contact profile

Reviewed ten contact/profile implementations. Convergence:

- identity + 3–5 frequent actions above the fold;
- information is grouped into inset sections;
- advanced notification/privacy/configuration is progressively disclosed;
- history/media is a separate navigable concept.

Examples: [WhatsApp contact info](https://mobbin.com/screens/a3e9d4e5-2fb5-4bb7-8f65-c34e0e8786ff),
[Apple Messages contact controls](https://mobbin.com/screens/58aa81c0-14d0-448a-be21-d9820344435b),
[Beside professional contact](https://mobbin.com/screens/4a458dba-3b10-49ef-9038-2291f5d830d4).

**Preserved:** hero actions, typed history and relationship ontology.  
**Further refinement:** relationship vectors stay collapsed; history remains
paginated.

### Integrations and Settings

Reviewed ten mature web settings implementations. Convergence:

- personal settings, integrations and diagnostics are separate levels;
- each integration is a self-contained row/card with connection state and one
clear action;
- destructive disconnect is secondary;
- errors explain recovery, not raw API internals.

Examples: [Cursor integrations and API keys](https://mobbin.com/screens/abcc7d0b-e2d2-4b18-942b-a3333bc23182),
[User Interviews integration cards](https://mobbin.com/screens/a663fa43-1fbe-4f01-a1cc-3525a6b75e70),
[Coda connected-account recovery](https://mobbin.com/screens/8c9b4a22-2d88-4a27-b78c-51892a141f97).

**Applied:** Profile / Integrations / Calls / Diagnostics IA, friendly provider
errors, autosave feedback and pending test actions.

### Automation creation

Reviewed Notion, Rocket Money, Opal, Deel and N26 rule flows. Convergence:

- express a rule as **When → Do**;
- progressively reveal only fields relevant to the chosen trigger/action;
- summarize the resulting rule in natural language;
- preview scope/effect before a consequential bulk action;
- execution history is human-readable, not raw JSON.

Examples: [Notion create automation](https://mobbin.com/flows/3f477882-4015-4936-942b-abeac5d20fbd),
[Rocket Money create rule](https://mobbin.com/flows/7b7baf84-973a-4fb5-a8e8-b835e1596515),
[Opal scheduled rule](https://mobbin.com/flows/7ab768e3-cf1b-44a5-a25c-046b27868231).

**Applied:** human-readable execution decision/results.  
**Preserved:** conditional form, permission level and permanent execution audit.

### Own-voice creation

Reviewed Character AI, Speechify, ElevenLabs and Beside. Convergence:

- state purpose and audio-quality guidance before permission;
- give one readable script and visible progress;
- recording → playback → re-record → consent → processing → selected voice;
- ownership consent is explicit and separate from the record button;
- successful voice becomes immediately identifiable/selectable.

Examples: [ElevenLabs Instant Voice Clone](https://mobbin.com/flows/5ebf7509-bbc7-474f-8e95-717e75c7cace),
[Speechify voice ownership and recording](https://mobbin.com/flows/7f4b1321-fd96-42fa-9070-7eb08eef8d80),
[Beside AI receptionist voice clone](https://mobbin.com/flows/7370e4ff-0193-4ba0-9717-b694cefea09a).

**Preserved:** script, timer, playback, re-record, minimum duration and
own-voice consent. Raw training audio remains unretained.

## Classification

### KEEP

- unified conversation model and transparent AI events;
- live surfaces that refresh without disturbing in-progress input;
- one glossary (`lib/terminology.ts`) owning every domain name and state word;
- persist-first idempotent communication pipelines;
- policy/envelope restraint;
- Apple list shell and professional contact hero;
- Settings autosave;
- guided “Min röst”.

### REFINE

- secondary surfaces toward the same Apple interaction grammar;
- remaining operator internals in system-generated audit summaries
  (`lib/ai/*`, `lib/automations/*`) and the raw-enum badges on Apollo and
  campaign rows;
- Assistant pending feedback;
- automation execution readability;
- filter/search continuity.

### RESTRUCTURE

- Settings into Profile / Integrations / Calls / Diagnostics;
- mobile contact/thread secondary context into progressive disclosure.

### REPLACE later

- `window.confirm` with an accessible native-styled alert dialog;
- single-owner password auth when multi-user support becomes real.

### REMOVE / demote

- raw JSON in owner-facing execution history;
- Activity as a primary mobile destination (keep under More/Diagnostics);
- duplicate “Today” terminology where no dedicated surface exists.

## Interaction grammar

1. **Navigation:** Phone, Messages and Contacts are primary; everything else is
   More/contextual.
2. **Actions:** one filled primary action; tinted secondary; plain contextual;
   red destructive with confirmation.
3. **Forms:** independent settings autosave with Saving → Saved/error; complex
   transactional forms have one explicit completion action.
4. **Thread states:** AI replying / You’re replying / Needs you / Paused /
   Closed. Closed means no composer.
5. **Feedback:** field status for autosave; inline message state for sends;
   persistent recovery copy for errors; skeletons for navigation.
6. **Lists:** two lines maximum per row; timestamps contextual; unread is weight
   plus indicator; filters preserve search.
7. **Advanced configuration:** collapsed by default; diagnostics never compete
   with daily tasks.
8. **Mobile:** 44px targets, safe-area footer, back action in detail screens;
   secondary context via sheet/section.
9. **Keyboard:** visible focus everywhere; Enter submits search; future
   composer shortcut is Cmd/Ctrl+Enter.
10. **Copy:** consumer language first; raw provider/model details only in
    Diagnostics.

## Priority and evidence

| Finding | Priority | Evidence |
|---|---|---|
| One name per concept; UI speaks the owner's language | P0 | Done — `lib/terminology.ts`; drift was measurable across nav, titles, schema and tests |
| Consequential actions state their consequence | P0 | Done — "Save batch" queued real SMS to N people; now "Skicka till N" |
| Closed thread must not send | P0 | High confidence, convergent messaging model |
| Destructive block needs confirmation | P0 | High confidence |
| Route/action loading and recovery | P1 | High confidence |
| Settings tiering | P1 | High confidence across web integrations |
| Human-readable automation results | P1 | High confidence |
| Search/filter continuity | P1 | High confidence |
| Real-time inbox | P1 | Done — server-rendered surfaces refresh on a polled change signal |
| Contact detail further decomposition | P2 | Medium confidence |
| Dark mode | P3 | Experiment / preference-dependent |

