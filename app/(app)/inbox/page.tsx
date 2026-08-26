import Link from "next/link";
import { format } from "date-fns";
import { listConversations, conversationStateLabel } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inbox" };

export default async function InboxPage() {
  const conversations = await listConversations();
  const open = conversations.filter((c) => c.status === "OPEN");
  const closed = conversations.filter((c) => c.status === "CLOSED");

  // Escalated first, then most recent.
  open.sort((a, b) => {
    const aEsc = a.aiControlState === "ESCALATED" ? 0 : 1;
    const bEsc = b.aiControlState === "ESCALATED" ? 0 : 1;
    if (aEsc !== bEsc) return aEsc - bEsc;
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });

  return (
    <>
      <PageHeader title="Inbox" subtitle="Active conversations" />
      {open.length === 0 ? (
        <EmptyState text="No active conversations." />
      ) : (
        <div className="space-y-2">
          {open.map((c) => (
            <Link key={c.id} href={`/inbox/${c.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 hover:border-stone-300">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.contactName}</p>
                  <p className="truncate text-sm text-stone-500">
                    {c.lastMessageText ?? "No messages yet"}
                  </p>
                  {c.lastMessageAt ? (
                    <p className="mt-0.5 text-xs text-stone-400">
                      {format(c.lastMessageAt, "d MMM HH:mm")}
                    </p>
                  ) : null}
                </div>
                <Badge label={conversationStateLabel(c.aiControlState, c.status)} />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {closed.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-semibold text-stone-500">
            Closed
          </h2>
          <div className="space-y-2 opacity-70">
            {closed.map((c) => (
              <Link key={c.id} href={`/inbox/${c.id}`} className="block">
                <Card className="flex items-center justify-between gap-3">
                  <p className="text-sm">{c.contactName}</p>
                  <Badge label="CLOSED" />
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
