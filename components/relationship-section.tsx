import type { Contact } from "@/lib/db/schema";
import {
  proposeRelationshipFromDescription,
  retryStyleExtraction,
  updateAdvancedRelationship,
  uploadStyleScreenshots,
} from "@/app/actions";
import { Card, inputClass, labelClass } from "@/components/ui";
import { resolveEnvelope } from "@/lib/ai/relationship";

const VECTOR_DIMS: { key: string; label: string }[] = [
  { key: "personalCloseness", label: "Personal closeness" },
  { key: "professionalRelevance", label: "Professional relevance" },
  { key: "formality", label: "Formality" },
  { key: "trust", label: "Trust" },
  { key: "humorTolerance", label: "Humor tolerance" },
  { key: "sensitiveTopicAccess", label: "Sensitive-topic access" },
  { key: "autonomousReplyFreedom", label: "Autonomous reply freedom" },
  { key: "proactiveContactDesired", label: "Proactive contact desired" },
  { key: "callThroughPriority", label: "Call-through priority" },
  { key: "privacySensitivity", label: "Privacy sensitivity" },
];

const ENVELOPE_ROWS: { key: string; label: string }[] = [
  { key: "SMALL_TALK", label: "Small talk" },
  { key: "JOKES", label: "Jokes" },
  { key: "GENERIC_LIFE_QUESTIONS", label: "Generic life questions" },
  { key: "KNOWN_SHARED_TOPICS", label: "Known shared topics" },
  { key: "SUGGEST_MEETING", label: "Suggest \u201cwe should meet\u201d" },
  { key: "AGREE_SPECIFIC_MEETING", label: "Agree to a specific meeting" },
  { key: "MONEY_OR_PAYMENT", label: "Money / payments" },
  { key: "PRIVATE_INFORMATION", label: "Share private information" },
  { key: "FACTUAL_COMMITMENT", label: "Factual commitments" },
  { key: "WORK_DECISION", label: "Work decisions" },
  { key: "CONFLICT_OR_EMOTION", label: "Conflict / emotional topics" },
];

const CALL_POLICIES: { value: string; label: string }[] = [
  { value: "INHERIT", label: "Follow global policy" },
  { value: "ALWAYS_RING_THROUGH", label: "Always ring through" },
  { value: "RING_THROUGH_DAYTIME", label: "Ring through daytime only" },
  { value: "VOICEMAIL", label: "Straight to voicemail" },
  { value: "SCREEN", label: "AI screening" },
  { value: "BLOCK", label: "Block calls" },
];

export function RelationshipSection({
  contact,
  screenshotCount,
  stylePending = 0,
  styleFailed = 0,
  styleError,
}: {
  contact: Contact;
  screenshotCount: number;
  stylePending?: number;
  styleFailed?: number;
  styleError?: string | null;
}) {
  const vector = (contact.relationshipVector ?? {}) as Record<string, number>;
  const envelope = resolveEnvelope(
    contact.autonomyLevel,
    contact.confidenceEnvelope,
  ) as Record<string, string>;
  const cp = contact.communicationProfile;

  return (
    <>
      <Card>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Relationship
        </h3>
        {contact.relationshipLabel ? (
          <p className="mt-1 text-sm font-medium text-stone-900">
            {contact.relationshipLabel}
          </p>
        ) : null}
        <form
          action={proposeRelationshipFromDescription.bind(null, contact.id)}
          className="mt-2"
        >
          <textarea
            name="description"
            rows={2}
            required
            defaultValue={contact.relationshipDescription ?? ""}
            placeholder="Describe the relationship in your own words — e.g. “En av mina närmaste vänner, men vi jobbar också ihop ibland.”"
            className="w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
          />
          <button className="mt-2 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            Let AI propose the profile
          </button>
        </form>

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">
            Advanced relationship
          </summary>
          <form
            action={updateAdvancedRelationship.bind(null, contact.id)}
            className="mt-3 space-y-4"
          >
            <label className={labelClass}>
              Label
              <input
                name="relationshipLabel"
                defaultValue={contact.relationshipLabel ?? ""}
                className={inputClass}
              />
            </label>
            <details className="rounded-xl border border-black/10 bg-white">
              <summary className="flex min-h-12 cursor-pointer items-center px-3 text-sm font-semibold text-stone-700">
                Relationship dimensions
                <span className="ml-auto text-xs font-normal text-stone-400">
                  0–100
                </span>
              </summary>
              <div className="grid gap-x-6 gap-y-1 border-t border-black/10 p-3 sm:grid-cols-2">
                {VECTOR_DIMS.map((dim) => (
                  <label
                    key={dim.key}
                    className="grid min-h-11 grid-cols-[minmax(0,1fr)_72px] items-center gap-3 text-sm text-stone-700"
                  >
                    <span>{dim.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      name={`vector_${dim.key}`}
                      defaultValue={vector[dim.key] ?? ""}
                      className="h-10 w-full rounded-lg border border-black/10 px-2 text-right text-sm focus-visible:ring-2 focus-visible:ring-[var(--system-blue)]"
                    />
                  </label>
                ))}
              </div>
            </details>

            <details className="rounded-xl border border-black/10 bg-white">
              <summary className="flex min-h-12 cursor-pointer items-center px-3 text-sm font-semibold text-stone-700">
                What AI may do
                <span className="ml-auto text-xs font-normal text-stone-400">
                  11 policies
                </span>
              </summary>
              <div className="grid gap-x-6 gap-y-1 border-t border-black/10 p-3 sm:grid-cols-2">
                {ENVELOPE_ROWS.map((row) => (
                  <label
                    key={row.key}
                    className="grid min-h-11 grid-cols-[minmax(0,1fr)_112px] items-center gap-3 text-sm text-stone-700"
                  >
                    <span>{row.label}</span>
                    <select
                      name={`envelope_${row.key}`}
                      defaultValue={envelope[row.key] ?? "ESCALATE"}
                      className="h-10 w-full rounded-lg border border-black/10 bg-white px-2 text-sm focus-visible:ring-2 focus-visible:ring-[var(--system-blue)]"
                    >
                      <option value="AUTO">Auto</option>
                      <option value="ESCALATE">Escalate</option>
                      <option value="BLOCK">Block</option>
                    </select>
                  </label>
                ))}
              </div>
            </details>

            <label className={labelClass}>
              Call policy
              <select
                name="callPolicy"
                defaultValue={contact.callPolicy}
                className={inputClass}
              >
                {CALL_POLICIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="sticky bottom-20 z-10 min-h-11 w-full rounded-xl bg-[var(--system-blue)] px-4 text-sm font-semibold text-white shadow-lg sm:static sm:w-auto sm:shadow-none">
              Save advanced settings
            </button>
          </form>
        </details>
      </Card>

      <Card>
        <details open={stylePending > 0 || styleFailed > 0}>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-stone-700">
            Teach AI how we talk
          </summary>
          <div className="border-t border-black/10 pt-3">
        <p className="mt-1 text-sm text-stone-500">
          Upload up to 10 screenshots of previous conversations. The AI
          extracts style — not content — and learns how you and{" "}
          {contact.firstName} write to each other.
          {screenshotCount > 0
            ? ` ${screenshotCount} screenshot(s) stored as provenance.`
            : ""}
        </p>
        {stylePending > 0 ? (
          <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Learning from {stylePending} screenshot{stylePending === 1 ? "" : "s"}.
            If interrupted, the scheduler retries automatically.
          </p>
        ) : null}
        {styleFailed > 0 ? (
          <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <p>
              Style learning needs attention
              {styleError ? `: ${styleError.slice(0, 120)}` : "."}
            </p>
            <form action={retryStyleExtraction.bind(null, contact.id)}>
              <button className="mt-1 font-semibold text-[var(--system-blue)]">
                Retry analysis
              </button>
            </form>
          </div>
        ) : null}
        <form
          action={uploadStyleScreenshots.bind(null, contact.id)}
          className="mt-2"
        >
          <input
            type="file"
            name="screenshots"
            accept="image/*"
            multiple
            required
            className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700 hover:file:bg-stone-200"
          />
          <button className="mt-2 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            Analyze style
          </button>
        </form>

        {cp?.ownerStyle ? (
          <div className="mt-3 rounded-md bg-stone-50 p-2.5 text-sm text-stone-700">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
              Learned communication profile
            </p>
            <p className="mt-1">
              You write {cp.ownerStyle.averageLength ?? "short"} messages in{" "}
              {cp.ownerStyle.language ?? "sv"}, formality{" "}
              {cp.ownerStyle.formality ?? "?"}, humor {cp.ownerStyle.humor ?? "?"},
              emoji frequency {cp.ownerStyle.emojiFrequency ?? "?"}.
            </p>
            {cp.recurringExpressions?.length ? (
              <p className="mt-1">
                Recurring expressions: {cp.recurringExpressions.join(", ")}
              </p>
            ) : null}
            {cp.commonTopics?.length ? (
              <p className="mt-1">Common topics: {cp.commonTopics.join(", ")}</p>
            ) : null}
          </div>
        ) : null}
          </div>
        </details>
      </Card>
    </>
  );
}
