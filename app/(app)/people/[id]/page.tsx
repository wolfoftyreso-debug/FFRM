import Link from "next/link";
import { notFound } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { getContactDetail, displayName, getStyleMediaSummary } from "@/lib/queries";
import { addFact, addReminder, archiveContact, callContact, messageContact, reviewFact, reviewCommitment } from "@/app/actions";
import { Badge, Card } from "@/components/ui";
import { RelationshipSection } from "@/components/relationship-section";
import {
  AppleAction,
  ContactAvatar,
  InsetSection,
  SegmentedLinks,
} from "@/components/apple-ui";
import {
  Bell,
  Bot,
  CalendarClock,
  Camera,
  MessageCircle,
  Phone,
  PhoneCall,
} from "lucide-react";
import { ConfirmForm } from "@/components/confirm-form";

export const dynamic = "force-dynamic";

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string; page?: string }>;
}) {
  const { id } = await params;
  const historyParams = await searchParams;
  const historyFilter = historyParams.history ?? "ALL";
  const historyPage = Math.max(1, Number(historyParams.page) || 1);
  const detail = await getContactDetail(id);
  if (!detail) notFound();
  const { contact, facts, commitments, automations, conversations, timeline } =
    detail;
  const styleMedia = await getStyleMediaSummary(contact.id);
  const filteredTimeline =
    historyFilter === "ALL"
      ? timeline
      : timeline.filter((item) => item.category === historyFilter);
  const historyPageSize = 40;
  const visibleTimeline = filteredTimeline.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize,
  );

  return (
    <>
      <header className="mb-7 text-center">
        <div className="flex justify-end">
          <Link
            href={`/people/${contact.id}/edit`}
            className="flex min-h-11 items-center px-2 text-[17px] text-[var(--system-blue)]"
          >
            Edit
          </Link>
        </div>
        <ContactAvatar name={displayName(contact)} size="xl" />
        <h1 className="mt-3 text-[28px] font-bold tracking-tight">
          {displayName(contact)}
        </h1>
        <p className="mt-1 text-[15px] text-[var(--secondary-label)]">
          {contact.relationshipLabel ?? contact.relationshipType}
          {contact.lastInteractionAt
            ? ` · ${formatDistanceToNow(contact.lastInteractionAt, { addSuffix: true })}`
            : " · No communication history"}
        </p>
        <div className="mt-5 flex justify-center gap-5">
          {contact.phoneNumber ? (
            <>
              <form action={callContact.bind(null, contact.id)}>
                <button className="flex min-w-16 flex-col items-center gap-1.5 text-xs font-medium text-[var(--system-blue)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--system-blue)] text-white">
                    <Phone className="h-5 w-5" />
                  </span>
                  Call
                </button>
              </form>
              <form action={messageContact.bind(null, contact.id)}>
                <button className="flex min-w-16 flex-col items-center gap-1.5 text-xs font-medium text-[var(--system-blue)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--system-blue)] text-white">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  Message
                </button>
              </form>
            </>
          ) : null}
          <AppleAction href="#reminder" icon={<Bell className="h-5 w-5" />} label="Remind" />
        </div>
      </header>

      <InsetSection title="Contact">
        {contact.phoneNumber ? (
          <a
            href={`tel:${contact.phoneNumber}`}
            className="ios-hairline block min-h-14 px-4 py-2.5"
          >
            <span className="text-xs text-[var(--secondary-label)]">mobile</span>
            <span className="block text-[17px] text-[var(--system-blue)]">
              {contact.phoneNumber}
            </span>
          </a>
        ) : null}
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="ios-hairline block min-h-14 px-4 py-2.5"
          >
            <span className="text-xs text-[var(--secondary-label)]">email</span>
            <span className="block text-[17px] text-[var(--system-blue)]">
              {contact.email}
            </span>
          </a>
        ) : null}
      </InsetSection>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <RelationshipSection
            contact={contact}
            screenshotCount={styleMedia.count}
            stylePending={styleMedia.pending}
            styleFailed={styleMedia.failed}
            styleError={styleMedia.latestError}
          />
          <section>
            <h2 className="mb-2 px-1 text-xl font-bold">History</h2>
            <div className="mb-3 overflow-x-auto">
              <div className="min-w-[650px]">
                <SegmentedLinks
                  active={historyFilter}
                  items={[
                    { id: "ALL", label: "All", href: `/people/${id}?history=ALL` },
                    { id: "MESSAGES", label: "Messages", href: `/people/${id}?history=MESSAGES` },
                    { id: "PHOTOS", label: "Photos", href: `/people/${id}?history=PHOTOS` },
                    { id: "CALLS", label: "Calls", href: `/people/${id}?history=CALLS` },
                    { id: "VOICEMAIL", label: "Voicemail", href: `/people/${id}?history=VOICEMAIL` },
                    { id: "AUTOMATIONS", label: "Automation", href: `/people/${id}?history=AUTOMATIONS` },
                    { id: "FACTS", label: "Facts", href: `/people/${id}?history=FACTS` },
                    { id: "REMINDERS", label: "Reminders", href: `/people/${id}?history=REMINDERS` },
                    { id: "SYSTEM", label: "System", href: `/people/${id}?history=SYSTEM` },
                  ]}
                />
              </div>
            </div>
            {filteredTimeline.length === 0 ? (
              <Card>
                <p className="py-4 text-center text-sm text-stone-400">
                  No events in this category.
                </p>
              </Card>
            ) : (
              <InsetSection>
                {visibleTimeline.map((entry) => {
                  const icon =
                    entry.category === "PHOTOS" ? Camera :
                    entry.category === "CALLS" ? PhoneCall :
                    entry.category === "VOICEMAIL" ? Phone :
                    entry.category === "AUTOMATIONS" ? Bot :
                    entry.category === "REMINDERS" ? CalendarClock :
                    MessageCircle;
                  const Icon = icon;
                  const content = (
                    <div className="ios-hairline flex gap-3 px-4 py-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--system-blue)]/10 text-[var(--system-blue)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[15px] font-semibold capitalize">{entry.title}</p>
                          <time className="shrink-0 text-xs text-[var(--system-gray)]">
                            {format(entry.at, "d MMM HH:mm")}
                          </time>
                        </div>
                        <p className="mt-0.5 line-clamp-3 text-[14px] text-[var(--secondary-label)]">
                          {entry.body}
                        </p>
                        {entry.mediaCount > 0 ? (
                          <span className="mt-1 inline-block text-xs text-[var(--system-blue)]">
                            {entry.mediaCount} photo{entry.mediaCount === 1 ? "" : "s"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                  return entry.href ? (
                    <Link key={entry.id} href={entry.href} className="block active:bg-black/[0.05]">
                      {content}
                    </Link>
                  ) : (
                    <div key={entry.id}>{content}</div>
                  );
                })}
              </InsetSection>
            )}
            {filteredTimeline.length > historyPageSize ? (
              <div className="mt-3 flex justify-center gap-2">
                {historyPage > 1 ? (
                  <Link
                    href={`/people/${id}?history=${historyFilter}&page=${historyPage - 1}`}
                    className="flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-[var(--system-blue)]"
                  >
                    Newer
                  </Link>
                ) : null}
                {historyPage * historyPageSize < filteredTimeline.length ? (
                  <Link
                    href={`/people/${id}?history=${historyFilter}&page=${historyPage + 1}`}
                    className="flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-[var(--system-blue)]"
                  >
                    Older
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
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
                      ) : c.status === "SUGGESTED" ? (
                        <div className="mt-1 flex gap-3">
                          <form
                            action={reviewCommitment.bind(
                              null,
                              c.id,
                              "CONFIRMED",
                            )}
                          >
                            <button className="text-xs font-medium text-[var(--system-blue)]">
                              Keep
                            </button>
                          </form>
                          <form
                            action={reviewCommitment.bind(
                              null,
                              c.id,
                              "DISMISSED",
                            )}
                          >
                            <button className="text-xs text-[var(--system-red)]">
                              Dismiss
                            </button>
                          </form>
                        </div>
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
                      href={`/messages/${c.id}`}
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
            <form
              id="reminder"
              action={addReminder.bind(null, contact.id)}
              className="mt-2 space-y-2"
            >
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

          <ConfirmForm
            action={archiveContact.bind(null, contact.id)}
            label="Archive contact"
            confirmText={`Archive ${displayName(contact)}? Messages and history remain stored.`}
          />
        </aside>
      </div>
    </>
  );
}
