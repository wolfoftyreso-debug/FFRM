import { format } from "date-fns";
import { listConversations, conversationStateLabel } from "@/lib/queries";
import {
  AppleRow,
  ContactAvatar,
  InsetSection,
  SegmentedLinks,
} from "@/components/apple-ui";
import { Search } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const view = params.view ?? "all";
  let conversations = await listConversations();

  conversations.sort((a, b) => {
    const aEsc = a.aiControlState === "ESCALATED" ? 0 : 1;
    const bEsc = b.aiControlState === "ESCALATED" ? 0 : 1;
    if (aEsc !== bEsc) return aEsc - bEsc;
    return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
  });
  if (q) {
    conversations = conversations.filter((c) =>
      `${c.contactName} ${c.lastMessageText ?? ""} ${c.peerNumber ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }
  if (view === "needs-you") {
    conversations = conversations.filter(
      (c) => c.status === "OPEN" && c.aiControlState === "ESCALATED",
    );
  } else if (view === "ai") {
    conversations = conversations.filter(
      (c) => c.status === "OPEN" && c.aiControlState === "AI",
    );
  } else if (view === "closed") {
    conversations = conversations.filter((c) => c.status === "CLOSED");
  } else {
    conversations = conversations.filter((c) => c.status === "OPEN");
  }

  return (
    <>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--system-blue)]">
            Personal Phone
          </p>
          <h1 className="text-[34px] font-bold tracking-tight">Messages</h1>
        </div>
      </div>
      <form method="get" className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--system-gray)]" />
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          aria-label="Search conversations"
          placeholder="Search"
          className="h-9 w-full rounded-xl border-0 bg-black/[0.06] pl-9 pr-3 text-[15px] outline-none placeholder:text-[var(--system-gray)]"
        />
        <input type="hidden" name="view" value={view} />
      </form>
      <div className="mb-5">
        <SegmentedLinks
          active={view}
          items={[
            { id: "all", label: "All", href: "/messages?view=all" },
            {
              id: "needs-you",
              label: "Needs You",
              href: "/messages?view=needs-you",
            },
            { id: "ai", label: "AI", href: "/messages?view=ai" },
            { id: "closed", label: "Closed", href: "/messages?view=closed" },
          ]}
        />
      </div>

      {conversations.length === 0 ? (
        <div className="ios-inset-group px-6 py-12 text-center">
          <MessageCircleIcon />
          <p className="mt-3 text-lg font-semibold">No conversations</p>
          <p className="mt-1 text-sm text-[var(--secondary-label)]">
            Messages to your 46elks number will appear here.
          </p>
        </div>
      ) : (
        <InsetSection>
          {conversations.map((c) => {
            const state = conversationStateLabel(c.aiControlState, c.status);
            return (
              <AppleRow
                key={c.id}
                href={`/messages/${c.id}`}
                leading={<ContactAvatar name={c.contactName} />}
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate font-semibold">{c.contactName}</span>
                    {state === "NEEDS YOU" ? (
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--system-red)]" />
                    ) : state === "AI HANDLING" ? (
                      <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                        AI
                      </span>
                    ) : null}
                  </span>
                }
                subtitle={c.lastMessageText ?? "No messages yet"}
                trailing={
                  c.lastMessageAt ? (
                    <time className="self-start pt-1 text-xs text-[var(--system-gray)]">
                      {format(c.lastMessageAt, "HH:mm")}
                    </time>
                  ) : null
                }
              />
            );
          })}
        </InsetSection>
      )}
    </>
  );
}

function MessageCircleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="mx-auto h-10 w-10 text-[var(--system-blue)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-3.8-.8L3 21l1.7-4.6A8.2 8.2 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />
    </svg>
  );
}
