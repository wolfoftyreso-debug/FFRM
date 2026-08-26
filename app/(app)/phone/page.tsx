import Link from "next/link";
import { format } from "date-fns";
import {
  PhoneIncoming,
  Phone,
  PhoneMissed,
  PhoneOutgoing,
  Voicemail as VoicemailIcon,
  PhoneOff,
} from "lucide-react";
import { listBlockedNumbers, listCalls, displayName } from "@/lib/queries";
import {
  blockNumber,
  callContact,
  markCallHandled,
  unblockNumber,
} from "@/app/actions";
import {
  ContactAvatar,
  InsetSection,
  SegmentedLinks,
} from "@/components/apple-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Phone" };

function stateIcon(state: string, direction: string) {
  if (state === "MISSED") return <PhoneMissed className="h-4 w-4 text-red-500" />;
  if (state === "VOICEMAIL")
    return <VoicemailIcon className="h-4 w-4 text-amber-600" />;
  if (state === "REJECTED") return <PhoneOff className="h-4 w-4 text-stone-400" />;
  return direction === "OUTBOUND" ? (
    <PhoneOutgoing className="h-4 w-4 text-emerald-600" />
  ) : (
    <PhoneIncoming className="h-4 w-4 text-emerald-600" />
  );
}

export default async function PhonePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view ?? "recents";
  const [allRows, blocked] = await Promise.all([
    listCalls(100),
    listBlockedNumbers(),
  ]);
  const blockedSet = new Set(blocked.map((b) => b.phoneNumber));
  const rows =
    view === "missed"
      ? allRows.filter(({ call }) => call.state === "MISSED")
      : view === "voicemail"
        ? allRows.filter(
            ({ call }) => call.state === "VOICEMAIL" || !!call.recordingUrl,
          )
        : allRows;

  return (
    <>
      <div className="mb-4">
        <p className="text-sm font-medium text-[var(--system-blue)]">
          Your 46elks number
        </p>
        <h1 className="text-[34px] font-bold tracking-tight">Phone</h1>
      </div>
      <div className="mb-5">
        <SegmentedLinks
          active={view}
          items={[
            { id: "recents", label: "Recents", href: "/phone?view=recents" },
            { id: "missed", label: "Missed", href: "/phone?view=missed" },
            {
              id: "voicemail",
              label: "Voicemail",
              href: "/phone?view=voicemail",
            },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <div className="ios-inset-group px-6 py-12 text-center">
          <Phone className="mx-auto h-10 w-10 text-[var(--system-blue)]" />
          <p className="mt-3 text-lg font-semibold">No calls here</p>
          <p className="mt-1 text-sm text-[var(--secondary-label)]">
            Calls to your number will appear automatically.
          </p>
        </div>
      ) : (
        <InsetSection>
          {rows.map(({ call, contact }) => {
            const who = contact ? displayName(contact) : call.fromNumber;
            const number =
              call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
            const isBlocked = blockedSet.has(number);
            return (
              <div key={call.id} className="ios-hairline px-4 py-3">
                <div className="flex items-start gap-3">
                  <ContactAvatar name={who} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {stateIcon(call.state, call.direction)}
                      <p
                        className={`truncate text-[17px] font-semibold ${
                          call.state === "MISSED"
                            ? "text-[var(--system-red)]"
                            : ""
                        }`}
                      >
                        {who}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[14px] text-[var(--secondary-label)]">
                      {call.direction === "INBOUND" ? "Incoming" : "Outgoing"} ·{" "}
                      {call.state.toLowerCase()}
                      {call.durationSeconds
                        ? ` · ${Math.floor(call.durationSeconds / 60)}:${String(call.durationSeconds % 60).padStart(2, "0")}`
                        : ""}{" "}
                      · {format(call.createdAt, "d MMM, HH:mm")}
                    </p>
                    {call.aiSummary ? (
                      <div className="mt-2 rounded-xl bg-black/[0.04] p-3">
                        <p className="text-xs font-semibold text-[var(--system-blue)]">
                          AI SUMMARY
                        </p>
                        <p className="mt-0.5 text-[14px]">{call.aiSummary}</p>
                        {call.aiRequiresUser ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--system-red)]">
                            Requires you
                          </p>
                        ) : null}
                      </div>
                    ) : call.transcript ? (
                      <p className="mt-2 line-clamp-3 text-[14px] text-[var(--secondary-label)]">
                        “{call.transcript}”
                      </p>
                    ) : call.state === "VOICEMAIL" && call.error ? (
                      <p className="mt-2 text-xs text-[var(--system-orange)]">
                        Voicemail saved · transcription retry pending/failed
                      </p>
                    ) : null}
                    {call.recordingUrl ? (
                      <audio
                        controls
                        preload="none"
                        className="mt-2 h-9 w-full max-w-sm"
                        src={`/api/calls/${call.id}/recording`}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {contact?.phoneNumber ? (
                    <form action={callContact.bind(null, contact.id)}>
                      <button className="rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]">
                        Call
                      </button>
                    </form>
                  ) : null}
                  {call.conversationId ? (
                    <Link
                      href={`/messages/${call.conversationId}`}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                    >
                      Conversation
                    </Link>
                  ) : null}
                  {contact ? (
                    <Link
                      href={`/people/${contact.id}`}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                    >
                      Contact
                    </Link>
                  ) : (
                    <>
                      <Link
                        href={`/people/new?phone=${encodeURIComponent(call.direction === "INBOUND" ? call.fromNumber : call.toNumber)}`}
                        className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                      >
                        Create contact
                      </Link>
                      <form action={(isBlocked ? unblockNumber : blockNumber).bind(null, number)}>
                        <button className="rounded-lg px-3 text-sm font-medium text-[var(--system-red)]">
                          {isBlocked ? "Unblock" : "Block"}
                        </button>
                      </form>
                    </>
                  )}
                  {call.aiRequiresUser ? (
                    <form action={markCallHandled.bind(null, call.id)}>
                      <button className="rounded-lg px-3 text-sm font-medium text-[var(--system-green)]">
                        Mark handled
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </InsetSection>
      )}
    </>
  );
}
