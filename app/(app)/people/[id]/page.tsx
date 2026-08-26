import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { getContactDetail, displayName } from "@/lib/queries";
import { addFact, addReminder, archiveContact, reviewFact, reviewCommitment } from "@/app/actions";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";

export const dynamic = "force-dynamic";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getContactDetail(id);
  if (!detail) notFound();
  const { contact, facts, commitments, automations, conversations, timeline } =
    detail;

  return (
    <>
      <PageHeader
        title={displayName(contact)}
        subtitle={[
          contact.relationshipType.charAt(0) +
            contact.relationshipType.slice(1).toLowerCase(),
          contact.phoneNumber,
          contact.birthday ? `🎂 ${contact.birthday}` : null,
          contact.lastInteractionAt
            ? `last contact ${formatDistanceToNow(contact.lastInteractionAt, { addSuffix: true })}`
            : "never contacted",
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex gap-2">
            <Link
              href={`/people/${contact.id}/edit`}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Edit
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-semibold text-stone-700">
              Timeline
            </h2>
            {timeline.length === 0 ? (
              <Card>
                <p className="py-4 text-center text-sm text-stone-400">
                  No history yet.
                </p>
              </Card>
            ) : (
              <Card className="divide-y divide-stone-100 p-0">
                {timeline.slice(0, 40).map((entry, i) => (
                  <div key={i} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-stone-500">
                        {entry.title}
                      </p>
                      <p className="shrink-0 text-xs text-stone-400">
                        {format(entry.at, "d MMM HH:mm")}
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-stone-800">
                      {entry.body}
                    </p>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Relationship
            </h3>
            <dl className="mt-2 space-y-1 text-sm text-stone-600">
              <div>
                <dt className="inline text-stone-400">Importance: </dt>
                <dd className="inline">{contact.importance}</dd>
              </div>
              <div>
                <dt className="inline text-stone-400">AI autonomy: </dt>
                <dd className="inline">{AUTONOMY_LABELS[contact.autonomyLevel]}</dd>
              </div>
              {contact.desiredContactCadenceDays ? (
                <div>
                  <dt className="inline text-stone-400">Cadence: </dt>
                  <dd className="inline">
                    every {contact.desiredContactCadenceDays} days
                  </dd>
                </div>
              ) : null}
              {contact.communicationStyle ? (
                <div>
                  <dt className="inline text-stone-400">Style: </dt>
                  <dd className="inline">{contact.communicationStyle}</dd>
                </div>
              ) : null}
              {contact.notes ? (
                <div>
                  <dt className="inline text-stone-400">Notes: </dt>
                  <dd className="inline">{contact.notes}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Facts
            </h3>
            {facts.length === 0 ? (
              <p className="mt-2 text-sm text-stone-400">No facts yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {facts.map((f) => (
                  <li key={f.id} className="flex items-start justify-between gap-2">
                    <span className={f.status === "DISMISSED" ? "text-stone-300 line-through" : "text-stone-700"}>
                      {f.fact}
                      {f.date ? ` (${f.date})` : ""}
                    </span>
                    {f.status === "SUGGESTED" ? (
                      <span className="flex shrink-0 gap-1">
                        <form action={reviewFact.bind(null, f.id, "CONFIRMED")}>
                          <button className="text-xs text-emerald-600 hover:underline">
                            Keep
                          </button>
                        </form>
                        <form action={reviewFact.bind(null, f.id, "DISMISSED")}>
                          <button className="text-xs text-stone-400 hover:underline">
                            No
                          </button>
                        </form>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <form action={addFact.bind(null, contact.id)} className="mt-3 flex gap-2">
              <input
                name="fact"
                required
                placeholder="Add a fact…"
                className="w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
              />
              <button className="shrink-0 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
                Add
              </button>
            </form>
          </Card>

          {commitments.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Commitments
              </h3>
              <ul className="mt-2 space-y-2 text-sm">
                {commitments
                  .filter((c) => c.status !== "DISMISSED")
                  .map((c) => (
                    <li key={c.id}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-stone-700">
                          {c.madeBy === "USER" ? "You" : contact.firstName}:{" "}
                          {c.description}
                          {c.dueAt ? ` (${format(c.dueAt, "d MMM")})` : ""}
                        </span>
                        <Badge label={c.status} />
                      </div>
                      {c.status === "CONFIRMED" ? (
                        <form
                          action={reviewCommitment.bind(null, c.id, "COMPLETED")}
                          className="mt-1"
                        >
                          <button className="text-xs text-emerald-600 hover:underline">
                            Mark completed
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Automations
            </h3>
            {automations.length === 0 ? (
              <p className="mt-2 text-sm text-stone-400">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {automations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/automations/${a.id}`}
                      className="truncate text-stone-700 hover:underline"
                    >
                      {a.name}
                    </Link>
                    <Badge label={a.enabled ? "ENABLED" : "DISABLED"} />
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/automations/new?contactId=${contact.id}`}
              className="mt-3 inline-block text-sm font-medium text-stone-900 underline underline-offset-2"
            >
              Add automation
            </Link>
          </Card>

          {conversations.length > 0 && (
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Conversations
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/inbox/${c.id}`}
                      className="text-stone-700 hover:underline"
                    >
                      {c.lastMessageAt
                        ? format(c.lastMessageAt, "d MMM HH:mm")
                        : "Empty"}{" "}
                      · {c.aiControlState}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Quick reminder
            </h3>
            <form action={addReminder.bind(null, contact.id)} className="mt-2 space-y-2">
              <input
                name="title"
                required
                placeholder="Remind me to…"
                className="w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
              />
              <input
                name="dueAt"
                type="datetime-local"
                className="w-full rounded-md border border-stone-300 px-2.5 py-1.5 text-sm focus:border-stone-500 focus:outline-none"
              />
              <button className="rounded-md border border-stone-300 px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
                Create reminder
              </button>
            </form>
          </Card>

          <form action={archiveContact.bind(null, contact.id)}>
            <button className="text-sm text-stone-400 hover:text-red-600">
              Archive contact
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
