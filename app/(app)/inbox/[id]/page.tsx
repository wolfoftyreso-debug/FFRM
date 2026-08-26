import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getConversationDetail, conversationStateLabel, displayName } from "@/lib/queries";
import {
  closeConversation,
  pauseConversation,
  returnConversationToAi,
  sendManualReply,
  takeOverConversation,
} from "@/app/actions";
import { Badge, Card } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getConversationDetail(id);
  if (!detail) notFound();
  const { conversation, contact, messages, facts } = detail;
  const stateLabel = conversationStateLabel(
    conversation.aiControlState,
    conversation.status,
  );
  const title = contact
    ? displayName(contact)
    : (conversation.peerNumber ?? "Unknown");

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {conversation.escalationReason ? (
              <p className="mt-1 text-sm text-red-600">
                {conversation.escalationReason}
              </p>
            ) : null}
          </div>
          <Badge label={stateLabel} />
        </div>

        <Card className="space-y-3">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">
              No messages yet.
            </p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.direction === "OUTBOUND"
                      ? m.sender === "AI"
                        ? "bg-violet-600 text-white"
                        : "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p
                    className={`mt-1 text-[10px] ${m.direction === "OUTBOUND" ? "text-white/70" : "text-stone-400"}`}
                  >
                    {format(m.createdAt, "d MMM HH:mm")}
                    {m.direction === "OUTBOUND"
                      ? ` · ${m.sender ?? ""} · ${m.status}`
                      : ""}
                  </p>
                </div>
              </div>
            ))
          )}
        </Card>

        <div className="mt-4 flex flex-wrap gap-2">
          {conversation.aiControlState !== "USER" && (
            <form action={takeOverConversation.bind(null, conversation.id)}>
              <button className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
                Take over
              </button>
            </form>
          )}
          {conversation.aiControlState !== "AI" && (
            <form action={returnConversationToAi.bind(null, conversation.id)}>
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
                Return to AI
              </button>
            </form>
          )}
          {conversation.aiControlState !== "PAUSED" && (
            <form action={pauseConversation.bind(null, conversation.id)}>
              <button className="rounded-md border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50">
                Pause AI
              </button>
            </form>
          )}
          {conversation.status === "OPEN" && (
            <form action={closeConversation.bind(null, conversation.id)}>
              <button className="rounded-md px-3 py-1.5 text-sm text-stone-400 hover:text-stone-600">
                Close
              </button>
            </form>
          )}
        </div>

        <form
          action={sendManualReply.bind(null, conversation.id)}
          className="mt-4"
        >
          <textarea
            name="text"
            rows={3}
            required
            placeholder="Write a reply… (sending takes over the conversation)"
            className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <button className="rounded-md bg-stone-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-700">
              Send SMS
            </button>
          </div>
        </form>
      </div>

      <aside className="space-y-4">
        {contact ? (
          <>
            <Card>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Contact
              </h3>
              <p className="mt-1 text-sm font-medium">
                <Link
                  href={`/people/${contact.id}`}
                  className="hover:underline"
                >
                  {displayName(contact)}
                </Link>
              </p>
              <dl className="mt-2 space-y-1 text-sm text-stone-600">
                <div>
                  <dt className="inline text-stone-400">Relationship: </dt>
                  <dd className="inline">
                    {contact.relationshipType} · {contact.importance}
                  </dd>
                </div>
                {contact.phoneNumber ? (
                  <div>
                    <dt className="inline text-stone-400">Phone: </dt>
                    <dd className="inline">{contact.phoneNumber}</dd>
                  </div>
                ) : null}
                {contact.birthday ? (
                  <div>
                    <dt className="inline text-stone-400">Birthday: </dt>
                    <dd className="inline">{contact.birthday}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="inline text-stone-400">AI autonomy: </dt>
                  <dd className="inline">
                    {AUTONOMY_LABELS[contact.autonomyLevel]}
                  </dd>
                </div>
              </dl>
            </Card>
            {facts.length > 0 && (
              <Card>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                  Relevant facts
                </h3>
                <ul className="mt-2 space-y-1.5 text-sm text-stone-600">
                  {facts.map((f) => (
                    <li key={f.id} className="flex items-start gap-1.5">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-stone-300" />
                      <span>
                        {f.fact}
                        {f.date ? ` (${f.date})` : ""}
                        {f.status === "SUGGESTED" ? (
                          <span className="ml-1 text-[10px] text-amber-600">
                            unconfirmed
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <p className="text-sm text-stone-500">
              Unknown sender. Create a contact with this number to enable AI
              handling.
            </p>
            <Link
              href={`/people/new?phone=${encodeURIComponent(conversation.peerNumber ?? "")}`}
              className="mt-2 inline-block text-sm font-medium text-stone-900 underline"
            >
              Create contact
            </Link>
          </Card>
        )}
        <Card>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            AI status
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            {conversation.aiControlState === "AI" &&
              "AI answers low-risk messages within policy."}
            {conversation.aiControlState === "USER" &&
              "You are handling this conversation. AI will not respond."}
            {conversation.aiControlState === "PAUSED" &&
              "Paused. Nobody responds automatically."}
            {conversation.aiControlState === "ESCALATED" &&
              "AI has escalated this conversation to you."}
          </p>
        </Card>
      </aside>
    </div>
  );
}
