import Link from "next/link";
import { format } from "date-fns";
import {
  getAssistantHistory,
  getTodayData,
  listOpenDrafts,
} from "@/lib/queries";
import {
  approveDraft,
  completeReminder,
  dismissReminder,
  reviewCommitment,
  reviewFact,
  sendAssistantMessage,
} from "@/app/actions";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

export default async function ChatPage() {
  const [history, data, drafts] = await Promise.all([
    getAssistantHistory(),
    getTodayData(),
    listOpenDrafts(),
  ]);
  const dueReminders = data.dueReminders.filter(
    (r) => r.reminder.kind !== "DRAFT",
  );
  const hasAttention =
    data.escalated.length > 0 ||
    drafts.length > 0 ||
    dueReminders.length > 0 ||
    data.suggestedFacts.length > 0 ||
    data.suggestedCommitments.length > 0;

  return (
    <>
      <PageHeader
        title="Chat"
        subtitle="Your assistant — ask about people, calls, birthdays, promises"
      />

      {hasAttention && (
        <div className="mb-6 space-y-2">
          {data.escalated.map((c) => (
            <Link key={c.id} href={`/messages/${c.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 py-3 hover:border-stone-300">
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

          {drafts.map(({ reminder, contact }) => (
            <Card key={reminder.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    Draft for{" "}
                    {contact
                      ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
                      : "unknown"}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap rounded-md bg-stone-50 p-2 text-sm text-stone-700">
                    {reminder.draftText}
                  </p>
                </div>
                <Badge label="DRAFT" />
              </div>
              <div className="mt-2 flex gap-2">
                <form action={approveDraft.bind(null, reminder.id)}>
                  <button className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                    Send
                  </button>
                </form>
                <form action={dismissReminder.bind(null, reminder.id)}>
                  <button className="rounded-md border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50">
                    Discard
                  </button>
                </form>
              </div>
            </Card>
          ))}

          {dueReminders.map(({ reminder, contact }) => (
            <Card
              key={reminder.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm">{reminder.title}</p>
                {contact ? (
                  <Link
                    href={`/people/${contact.id}`}
                    className="text-xs text-stone-400 hover:underline"
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
                  <button className="px-1 py-1 text-xs text-stone-400 hover:text-stone-600">
                    Dismiss
                  </button>
                </form>
              </div>
            </Card>
          ))}

          {data.suggestedFacts.map(({ fact, contact }) => (
            <Card
              key={fact.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <p className="min-w-0 text-sm">
                <span className="font-medium">{contact.firstName}:</span>{" "}
                {fact.fact}
                {fact.date ? ` (${fact.date})` : ""}{" "}
                <span className="text-xs text-stone-400">— AI memory</span>
              </p>
              <div className="flex shrink-0 gap-2">
                <form action={reviewFact.bind(null, fact.id, "CONFIRMED")}>
                  <button className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                    Keep
                  </button>
                </form>
                <form action={reviewFact.bind(null, fact.id, "DISMISSED")}>
                  <button className="px-1 py-1 text-xs text-stone-400 hover:text-stone-600">
                    No
                  </button>
                </form>
              </div>
            </Card>
          ))}

          {data.suggestedCommitments.map(({ commitment, contact }) => (
            <Card
              key={commitment.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <p className="min-w-0 text-sm">
                <span className="font-medium">
                  {commitment.madeBy === "USER"
                    ? "You promised"
                    : `${contact.firstName} promised`}
                  :
                </span>{" "}
                {commitment.description}{" "}
                <span className="text-xs text-stone-400">— detected</span>
              </p>
              <div className="flex shrink-0 gap-2">
                <form
                  action={reviewCommitment.bind(null, commitment.id, "CONFIRMED")}
                >
                  <button className="rounded-md border border-emerald-300 px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-50">
                    Keep
                  </button>
                </form>
                <form
                  action={reviewCommitment.bind(null, commitment.id, "DISMISSED")}
                >
                  <button className="px-1 py-1 text-xs text-stone-400 hover:text-stone-600">
                    No
                  </button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="space-y-3">
        {history.length === 0 ? (
          <div className="py-8 text-center text-sm text-stone-400">
            <p>Ask me anything about your relationships.</p>
            <p className="mt-2 text-xs">
              &quot;Vem behöver uppmärksamhet?&quot; · &quot;När pratade jag
              med Johan senast?&quot; · &quot;Vilka födelsedagar kommer?&quot;
              · &quot;Påminn mig att ringa mamma nästa vecka&quot;
            </p>
          </div>
        ) : (
          history.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-900"
                }`}
              >
                {m.content}
                <p
                  className={`mt-1 text-[10px] ${m.role === "user" ? "text-white/60" : "text-stone-400"}`}
                >
                  {format(m.createdAt, "HH:mm")}
                </p>
              </div>
            </div>
          ))
        )}
      </Card>

      <form action={sendAssistantMessage} className="mt-4">
        <textarea
          name="text"
          rows={2}
          required
          placeholder="Ask your assistant…"
          className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
            Send
          </button>
        </div>
      </form>
    </>
  );
}
