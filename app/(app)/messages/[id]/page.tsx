import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getConversationDetail, conversationStateLabel, displayName } from "@/lib/queries";
import {
  closeConversation,
  pauseConversation,
  reopenConversation,
  returnConversationToAi,
  takeOverConversation,
} from "@/app/actions";
import { Badge, Card } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";
import { MessageComposer } from "@/components/message-composer";
import { ContactAvatar } from "@/components/apple-ui";
import { ConversationReadReceipt } from "@/components/conversation-read-receipt";
import { ChevronLeft } from "lucide-react";
import { PendingActionButton } from "@/components/pending-action-button";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getConversationDetail(id);
  if (!detail) notFound();
  const { conversation, contact, messages, facts, mediaByMessage } = detail;
  const stateLabel = conversationStateLabel(
    conversation.aiControlState,
    conversation.status,
  );
  const title = contact
    ? displayName(contact)
    : (conversation.peerNumber ?? "Unknown");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <ConversationReadReceipt conversationId={conversation.id} />
      <div>
        <header className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 border-b border-black/10 bg-[var(--system-gray-6)]/90 py-2 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/messages"
              aria-label="Back to Messages"
              className="flex h-11 w-8 items-center justify-start text-[var(--system-blue)] md:hidden"
            >
              <ChevronLeft className="h-6 w-6" />
            </Link>
            <ContactAvatar name={title} />
            <div className="min-w-0">
            <h1 className="truncate text-[17px] font-semibold">{title}</h1>
            {conversation.escalationReason ? (
              <p className="truncate text-xs text-[var(--system-red)]">
                {conversation.escalationReason}
              </p>
            ) : (
              <p className="text-xs text-[var(--secondary-label)]">
                {conversation.aiControlState === "AI"
                  ? "AI handling low-risk messages"
                  : conversation.aiControlState === "USER"
                    ? "You are handling"
                    : conversation.aiControlState.toLowerCase()}
              </p>
            )}
            </div>
          </div>
          <Badge label={stateLabel} />
        </header>

        <div className="ios-inset-group ios-scroll min-h-[45vh] space-y-2 p-3 md:p-4">
          {messages.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-400">
              No messages yet.
            </p>
          ) : (
            messages.map((m) => {
              const assets = mediaByMessage[m.id] ?? [];
              if (m.contentType === "SYSTEM" || m.direction === "SYSTEM") {
                const automated = m.channel === "AUTOMATION";
                return (
                  <div key={m.id} className="py-1 text-center">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-[11px] ${
                        automated
                          ? "bg-blue-50 font-semibold text-blue-700"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {automated ? "⚙ Automatic · " : ""}
                      {m.text} · {format(m.createdAt, "HH:mm")}
                    </span>
                  </div>
                );
              }
              return (
              <div
                key={m.id}
                className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    m.direction === "OUTBOUND"
                      ? m.sender === "AI"
                        ? "rounded-br-md bg-violet-500 text-white"
                        : "rounded-br-md bg-[var(--system-blue)] text-white"
                      : "rounded-bl-md bg-[#e9e9eb] text-black"
                  }`}
                >
                  {assets.map((asset) =>
                    asset.dataBase64 ? (
                      <div key={asset.id} className="mb-2">
                        {/* Authenticated same-origin media route. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.storageUrl ?? `/api/media/${asset.id}`}
                          alt={asset.analysis?.caption ?? "MMS image"}
                          width={asset.width ?? 640}
                          height={asset.height ?? 480}
                          className="max-h-80 w-auto max-w-full rounded-lg object-contain"
                        />
                        {asset.analysisStatus === "COMPLETED" &&
                        asset.analysis ? (
                          <details className="mt-1 text-left">
                            <summary
                              className={`cursor-pointer text-[10px] ${
                                m.direction === "OUTBOUND"
                                  ? "text-white/70"
                                  : "text-stone-400"
                              }`}
                            >
                              AI saw this · confidence{" "}
                              {Math.round((asset.analysisConfidence ?? 0) * 100)}%
                            </summary>
                            <div
                              className={`mt-1 rounded-md p-2 text-xs ${
                                m.direction === "OUTBOUND"
                                  ? "bg-white/10 text-white/90"
                                  : "bg-white text-stone-600"
                              }`}
                            >
                              <p>
                                <span className="font-medium">
                                  Direct observation:
                                </span>{" "}
                                {asset.analysis.caption}
                              </p>
                              {asset.analysis.visibleText?.length ? (
                                <p className="mt-1">
                                  Visible text:{" "}
                                  {asset.analysis.visibleText.join(", ")}
                                </p>
                              ) : null}
                              {asset.analysis.contextualInterpretation ? (
                                <p className="mt-1">
                                  <span className="font-medium">
                                    Contextual interpretation:
                                  </span>{" "}
                                  {asset.analysis.contextualInterpretation}
                                </p>
                              ) : null}
                              <p className="mt-1 opacity-70">
                                Model: {asset.analysisModel}
                              </p>
                            </div>
                          </details>
                        ) : asset.analysisStatus === "FAILED" ? (
                          <p className="mt-1 text-[10px] text-red-400">
                            AI could not safely understand this image.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        key={asset.id}
                        className="mb-2 rounded-md border border-dashed border-current/20 p-4 text-center text-xs opacity-70"
                      >
                        Processing image…
                      </div>
                    ),
                  )}
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
              );
            })
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {conversation.aiControlState !== "USER" && (
            <form action={takeOverConversation.bind(null, conversation.id)}>
              <PendingActionButton variant="filled" pendingText="Taking over…">
                Take over
              </PendingActionButton>
            </form>
          )}
          {conversation.aiControlState !== "AI" && (
            <form action={returnConversationToAi.bind(null, conversation.id)}>
              <PendingActionButton variant="tinted" pendingText="Returning…">
                Return to AI
              </PendingActionButton>
            </form>
          )}
          {conversation.aiControlState !== "PAUSED" && (
            <form action={pauseConversation.bind(null, conversation.id)}>
              <PendingActionButton variant="plain" pendingText="Pausing…">
                Pause AI
              </PendingActionButton>
            </form>
          )}
          {conversation.status === "OPEN" && (
            <form action={closeConversation.bind(null, conversation.id)}>
              <PendingActionButton pendingText="Closing…">
                Close
              </PendingActionButton>
            </form>
          )}
          {conversation.status === "CLOSED" && (
            <form action={reopenConversation.bind(null, conversation.id)}>
              <PendingActionButton variant="filled" pendingText="Reopening…">
                Reopen
              </PendingActionButton>
            </form>
          )}
        </div>

        {conversation.status === "OPEN" ? (
          <MessageComposer
            conversationId={conversation.id}
            contactId={contact?.id ?? null}
          />
        ) : (
          <div className="ios-safe-bottom sticky bottom-16 z-20 mt-3 rounded-2xl border border-black/10 bg-white/95 p-4 text-center shadow-lg md:bottom-2">
            <p className="text-sm text-[var(--secondary-label)]">
              This conversation is closed. Reopen it before sending a message.
            </p>
          </div>
        )}
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
