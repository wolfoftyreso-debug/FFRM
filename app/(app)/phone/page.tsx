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
  callNumber,
  callContact,
  markCallHandled,
  unblockNumber,
} from "@/app/actions";
import {
  ContactAvatar,
  InsetSection,
  SegmentedLinks,
} from "@/components/apple-ui";
import { ConfirmForm } from "@/components/confirm-form";
import { Card, PrimaryButton, inputClass } from "@/components/ui";
import { getReceptionistState } from "@/lib/voice/receptionist-config";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.phone };

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
  searchParams: Promise<{
    view?: string;
    dial?: string;
    error?: string;
    started?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view ?? "recents";
  const [allRows, blocked, receptionist] = await Promise.all([
    listCalls(100),
    listBlockedNumbers(),
    getReceptionistState(),
  ]);
  const blockedSet = new Set(blocked.map((b) => b.phoneNumber));
  const rows =
    view === "missed"
      ? allRows.filter(({ call }) => call.state === "MISSED")
      : view === "voicemail"
        ? allRows.filter(
            ({ call }) => call.state === "VOICEMAIL" || !!call.recordingUrl,
          )
        : view === "callback"
          ? allRows.filter(
              ({ call }) =>
                call.screeningDecision === "CALLBACK" && call.aiRequiresUser,
            )
        : allRows;

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--system-blue)]">
            Ditt 46elks-nummer
          </p>
          <h1 className="text-[34px] font-bold tracking-tight">{TERMS.phone}</h1>
        </div>
        <Link
          href={params.dial ? "/phone" : "/phone?dial=1"}
          className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--system-blue)] px-4 text-sm font-semibold text-white"
        >
          <Phone className="h-4 w-4" />
          {params.dial ? "Close" : "Call"}
        </Link>
      </div>
      {params.started ? (
        <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          Ringer din telefon nu. Svara så kopplas det utgående samtalet.
        </p>
      ) : null}
      <Link
        href="/settings?section=calls"
        className="mb-4 flex min-h-14 items-center justify-between rounded-2xl bg-white px-4"
      >
        <span>
          <span className="block text-[16px] font-semibold">AI-växel</span>
          <span className="block text-xs text-[var(--secondary-label)]">
            Namn och ärende krävs före framkoppling
          </span>
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            receptionist?.config.enabled
              ? "bg-green-100 text-green-800"
              : "bg-stone-100 text-stone-600"
          }`}
        >
          {receptionist?.config.enabled ? "AKTIV" : "AV"}
        </span>
      </Link>
      {params.dial ? (
        <Card className="mb-5">
          <form action={callNumber} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm font-medium">
              Nummer att ringa
              <input
                name="phoneNumber"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+46 70 123 45 67"
                required
                className={inputClass}
              />
            </label>
            <PrimaryButton>Ring via 46elks</PrimaryButton>
          </form>
          {params.error ? (
            <p className="mt-2 text-sm text-[var(--system-red)]">
              Ange ett giltigt telefonnummer med landskod.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-[var(--secondary-label)]">
            We call you first, then connect the recipient. Connected calls are
            recorded and transcribed.
          </p>
        </Card>
      ) : null}
      <div className="mb-5">
        <SegmentedLinks
          active={view}
          items={[
            { id: "recents", label: "Senaste", href: "/phone?view=recents" },
            { id: "missed", label: "Missade", href: "/phone?view=missed" },
            {
              id: "voicemail",
              label: "Röstbrevlåda",
              href: "/phone?view=voicemail",
            },
            {
              id: "callback",
              label: "Återuppringning",
              href: "/phone?view=callback",
            },
          ]}
        />
      </div>
      {rows.length === 0 ? (
        <div className="ios-inset-group px-6 py-12 text-center">
          <Phone className="mx-auto h-10 w-10 text-[var(--system-blue)]" />
          <p className="mt-3 text-lg font-semibold">Inga samtal här</p>
          <p className="mt-1 text-sm text-[var(--secondary-label)]">
            Samtal till ditt nummer dyker upp här automatiskt.
          </p>
        </div>
      ) : (
        <InsetSection>
          {rows.map(({ call, contact }) => {
            const who = contact
              ? displayName(contact)
              : call.callerName || call.fromNumber;
            const number =
              call.direction === "INBOUND" ? call.fromNumber : call.toNumber;
            const isBlocked = blockedSet.has(number);
            return (
              <div key={call.id} className="ios-hairline px-4 py-3">
                <div className="flex items-start gap-3">
                  <ContactAvatar
                    name={who}
                    photoUrl={
                      contact?.photoDataBase64
                        ? `/api/contacts/${contact.id}/photo`
                        : null
                    }
                  />
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
                      {call.direction === "INBOUND" ? "Inkommande" : "Utgående"} ·{" "}
                      {call.state.toLowerCase()}
                      {call.durationSeconds
                        ? ` · ${Math.floor(call.durationSeconds / 60)}:${String(call.durationSeconds % 60).padStart(2, "0")}`
                        : ""}{" "}
                      · {format(call.createdAt, "d MMM, HH:mm")}
                    </p>
                    {call.aiSummary || call.screeningSummary ? (
                      <div className="mt-2 rounded-xl bg-black/[0.04] p-3">
                        <p className="text-xs font-semibold text-[var(--system-blue)]">
                          {call.screeningState ? "AI-VÄXEL" : "AI SUMMARY"}
                        </p>
                        <p className="mt-0.5 text-[14px]">
                          {call.screeningSummary ?? call.aiSummary}
                        </p>
                        {call.callerPurpose ? (
                          <p className="mt-1 text-xs text-[var(--secondary-label)]">
                            Ärende: {call.callerPurpose}
                          </p>
                        ) : null}
                        {call.aiRequiresUser ? (
                          <p className="mt-1 text-xs font-semibold text-[var(--system-red)]">
                            Kräver dig
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
                      <button className="min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]">
                        Ring
                      </button>
                    </form>
                  ) : null}
                  <Link
                    href={`/phone/${call.id}`}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                  >
                    Detaljer
                  </Link>
                  {call.conversationId ? (
                    <Link
                      href={`/messages/${call.conversationId}`}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                    >
                      Konversation
                    </Link>
                  ) : null}
                  {contact ? (
                    <Link
                      href={`/people/${contact.id}`}
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                    >
                      Kontakt
                    </Link>
                  ) : (
                    <>
                      <Link
                        href={`/people/new?phone=${encodeURIComponent(call.direction === "INBOUND" ? call.fromNumber : call.toNumber)}`}
                        className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]"
                      >
                        Skapa kontakt
                      </Link>
                      {isBlocked ? (
                        <form action={unblockNumber.bind(null, number)}>
                          <button className="rounded-lg px-3 text-sm font-medium text-[var(--system-blue)]">
                            Avblockera
                          </button>
                        </form>
                      ) : (
                        <ConfirmForm
                          action={blockNumber.bind(null, number)}
                          label="Blockera"
                          confirmText={`Blockera ${number}? Inkommande samtal avvisas då.`}
                        />
                      )}
                    </>
                  )}
                  {call.aiRequiresUser ? (
                    <form action={markCallHandled.bind(null, call.id)}>
                      <button className="min-h-11 rounded-lg px-3 text-sm font-medium text-[var(--system-green)]">
                        Markera som hanterat
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
