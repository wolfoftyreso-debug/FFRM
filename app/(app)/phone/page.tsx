import Link from "next/link";
import { format } from "date-fns";
import {
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Voicemail as VoicemailIcon,
  PhoneOff,
} from "lucide-react";
import { listCalls, displayName } from "@/lib/queries";
import { blockNumber, callContact } from "@/app/actions";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

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

function stateBadge(state: string): string {
  switch (state) {
    case "MISSED":
      return "NEEDS YOU";
    case "VOICEMAIL":
      return "REMINDER";
    case "COMPLETED":
    case "CONNECTED":
      return "COMPLETED";
    case "REJECTED":
      return "DISABLED";
    default:
      return state;
  }
}

export default async function PhonePage() {
  const rows = await listCalls(60);

  return (
    <>
      <PageHeader
        title="Phone"
        subtitle="Calls on your number — routed by your relationships"
      />
      {rows.length === 0 ? (
        <EmptyState text="No calls yet. Incoming calls to your 46elks number appear here." />
      ) : (
        <div className="space-y-2">
          {rows.map(({ call, contact }) => {
            const who = contact ? displayName(contact) : call.fromNumber;
            return (
              <Card key={call.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5">{stateIcon(call.state, call.direction)}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {contact ? (
                          <Link
                            href={`/people/${contact.id}`}
                            className="hover:underline"
                          >
                            {who}
                          </Link>
                        ) : (
                          who
                        )}
                      </p>
                      <p className="text-xs text-stone-400">
                        {call.direction === "INBOUND" ? "Incoming" : "Outgoing"} ·{" "}
                        {call.state.toLowerCase()}
                        {call.durationSeconds
                          ? ` · ${Math.floor(call.durationSeconds / 60)}:${String(call.durationSeconds % 60).padStart(2, "0")}`
                          : ""}{" "}
                        · {format(call.createdAt, "d MMM HH:mm")}
                      </p>
                      {call.policyReason ? (
                        <p className="mt-0.5 text-xs text-stone-400">
                          Policy: {call.policyReason}
                        </p>
                      ) : null}
                      {call.aiSummary ? (
                        <div className="mt-2 rounded-md bg-stone-50 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                            AI summary
                          </p>
                          <p className="text-sm text-stone-700">{call.aiSummary}</p>
                          {call.aiRequiresUser ? (
                            <p className="mt-1 text-xs font-medium text-red-600">
                              Requires you.
                            </p>
                          ) : null}
                        </div>
                      ) : call.transcript ? (
                        <p className="mt-1.5 line-clamp-2 text-sm text-stone-600">
                          “{call.transcript}”
                        </p>
                      ) : call.state === "VOICEMAIL" && call.error ? (
                        <p className="mt-1.5 text-xs text-amber-700">
                          Voicemail received — transcription failed.
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge label={stateBadge(call.state)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {contact?.phoneNumber ? (
                    <form action={callContact.bind(null, contact.id)}>
                      <button className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white hover:bg-stone-700">
                        Call
                      </button>
                    </form>
                  ) : null}
                  {contact ? (
                    <Link
                      href={`/people/${contact.id}`}
                      className="rounded-md border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50"
                    >
                      Contact
                    </Link>
                  ) : (
                    <>
                      <Link
                        href={`/people/new?phone=${encodeURIComponent(call.direction === "INBOUND" ? call.fromNumber : call.toNumber)}`}
                        className="rounded-md border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-50"
                      >
                        Create contact
                      </Link>
                      <form
                        action={blockNumber.bind(
                          null,
                          call.direction === "INBOUND" ? call.fromNumber : call.toNumber,
                        )}
                      >
                        <button className="rounded-md px-3 py-1 text-xs text-stone-400 hover:text-red-600">
                          Block
                        </button>
                      </form>
                    </>
                  )}
                  {call.transcript ? (
                    <details className="text-xs text-stone-500">
                      <summary className="cursor-pointer rounded-md border border-stone-200 px-3 py-1 hover:bg-stone-50">
                        Transcript
                      </summary>
                      <p className="mt-2 max-w-prose whitespace-pre-wrap rounded-md bg-stone-50 p-2">
                        {call.transcript}
                      </p>
                    </details>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
