import Link from "next/link";
import { format } from "date-fns";
import { getTodayData, listOpenDrafts } from "@/lib/queries";
import {
  approveDraft,
  completeReminder,
  dismissReminder,
  reviewCommitment,
  reviewFact,
} from "@/app/actions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [data, drafts] = await Promise.all([getTodayData(), listOpenDrafts()]);

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={format(new Date(), "EEEE d MMMM yyyy")}
      />

      <div className="space-y-6">
        {data.escalated.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-700">
              Needs you
            </h2>
            <div className="space-y-2">
              {data.escalated.map((c) => (
                <Link key={c.id} href={`/inbox/${c.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 hover:border-stone-300">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.contactName}</p>
                      <p className="truncate text-sm text-stone-500">
                        {c.escalationReason ?? c.lastMessageText ?? ""}
                      </p>
                    </div>
                    <Badge label="NEEDS YOU" />
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {drafts.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-700">
              Drafts awaiting your approval
            </h2>
            <div className="space-y-2">
              {drafts.map(({ reminder, contact }) => (
                <Card key={reminder.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {contact
                          ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
                          : reminder.title}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap rounded-md bg-stone-50 p-2 text-sm text-stone-700">
                        {reminder.draftText}
                      </p>
                    </div>
                    <Badge label="DRAFT" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <form action={approveDraft.bind(null, reminder.id)}>
                      <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                        Send
                      </button>
                    </form>
                    <form action={dismissReminder.bind(null, reminder.id)}>
                      <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
                        Discard
                      </button>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            Reminders
          </h2>
          {data.dueReminders.filter((r) => r.reminder.kind !== "DRAFT").length ===
          0 ? (
            <EmptyState text="Nothing due right now." />
          ) : (
            <div className="space-y-2">
              {data.dueReminders
                .filter((r) => r.reminder.kind !== "DRAFT")
                .map(({ reminder, contact }) => (
                  <Card
                    key={reminder.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{reminder.title}</p>
                      {reminder.description ? (
                        <p className="text-sm text-stone-500">
                          {reminder.description}
                        </p>
                      ) : null}
                      {contact ? (
                        <Link
                          href={`/people/${contact.id}`}
                          className="text-xs text-stone-400 underline-offset-2 hover:underline"
                        >
                          {contact.firstName} {contact.lastName ?? ""}
                        </Link>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={completeReminder.bind(null, reminder.id)}>
                        <button className="rounded-md border border-stone-300 px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-50">
                          Done
                        </button>
                      </form>
                      <form action={dismissReminder.bind(null, reminder.id)}>
                        <button className="rounded-md px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
                          Dismiss
                        </button>
                      </form>
                    </div>
                  </Card>
                ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            Next 7 days
          </h2>
          {data.upcoming.length === 0 ? (
            <EmptyState text="Nothing scheduled." />
          ) : (
            <Card className="divide-y divide-stone-100 p-0">
              {data.upcoming.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{item.title}</p>
                    <p className="text-xs text-stone-400">
                      {format(item.at, "EEE d MMM HH:mm")}
                      {item.contactName ? ` · ${item.contactName}` : ""}
                    </p>
                  </div>
                  <Badge label={item.kind} />
                </div>
              ))}
            </Card>
          )}
        </section>

        {(data.suggestedFacts.length > 0 ||
          data.suggestedCommitments.length > 0) && (
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-700">
              AI suggestions to review
            </h2>
            <div className="space-y-2">
              {data.suggestedFacts.map(({ fact, contact }) => (
                <Card
                  key={fact.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">{contact.firstName}:</span>{" "}
                      {fact.fact}
                      {fact.date ? ` (${fact.date})` : ""}
                    </p>
                    <p className="text-xs text-stone-400">
                      Extracted memory · confidence{" "}
                      {((fact.confidence ?? 0) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={reviewFact.bind(null, fact.id, "CONFIRMED")}>
                      <button className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                        Keep
                      </button>
                    </form>
                    <form action={reviewFact.bind(null, fact.id, "DISMISSED")}>
                      <button className="rounded-md px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </Card>
              ))}
              {data.suggestedCommitments.map(({ commitment, contact }) => (
                <Card
                  key={commitment.id}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-medium">
                        {commitment.madeBy === "USER"
                          ? "You promised"
                          : `${contact.firstName} promised`}
                        :
                      </span>{" "}
                      {commitment.description}
                    </p>
                    <p className="text-xs text-stone-400">
                      Detected commitment
                      {commitment.dueAt
                        ? ` · due ${format(commitment.dueAt, "d MMM")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form
                      action={reviewCommitment.bind(
                        null,
                        commitment.id,
                        "CONFIRMED",
                      )}
                    >
                      <button className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                        Keep
                      </button>
                    </form>
                    <form
                      action={reviewCommitment.bind(
                        null,
                        commitment.id,
                        "DISMISSED",
                      )}
                    >
                      <button className="rounded-md px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
                        Dismiss
                      </button>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
