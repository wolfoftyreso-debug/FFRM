import { notFound } from "next/navigation";
import { getCallDetail } from "@/lib/review";
import { completeReminder } from "@/app/actions";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CallDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ quote?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const row = await getCallDetail(id);
  if (!row) notFound();
  const { call, contact, callbackTicket } = row;
  const who = contact
    ? contact.displayName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : call.callerName || call.fromNumber;
  const quote = query.quote ?? "";
  const text = call.transcript ?? "No transcript yet.";
  const index = quote ? text.indexOf(quote) : -1;

  return (
    <>
      <PageHeader title={who} subtitle={`${call.direction} · ${call.state}`} />
      {call.screeningState ? (
        <section className="mb-4 rounded-2xl bg-blue-50 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-blue-950">AI-växel</h2>
            <Badge label={call.screeningDecision ?? call.screeningState} />
          </div>
          <dl className="mt-3 grid gap-2 text-sm">
            <div>
              <dt className="text-blue-700">Namn</dt>
              <dd className="font-medium text-blue-950">
                {call.callerName ?? "Ej bekräftat"}
              </dd>
            </div>
            <div>
              <dt className="text-blue-700">Ärende</dt>
              <dd className="font-medium text-blue-950">
                {call.callerPurpose ?? "Ej bekräftat"}
              </dd>
            </div>
            {call.screeningSummary ? (
              <div>
                <dt className="text-blue-700">Sammanfattning</dt>
                <dd className="text-blue-950">{call.screeningSummary}</dd>
              </div>
            ) : null}
          </dl>
          {callbackTicket?.status === "PENDING" ? (
            <form
              action={completeReminder.bind(null, callbackTicket.id)}
              className="mt-4"
            >
              <button className="min-h-12 w-full rounded-xl bg-[var(--system-green)] font-semibold text-white">
                Markera återuppringning hanterad
              </button>
            </form>
          ) : null}
        </section>
      ) : null}
      {call.recordingUrl || call.recordingDataBase64 ? (
        <audio
          controls
          src={`/api/calls/${call.id}/recording`}
          className="mb-4 w-full"
        />
      ) : null}
      {call.aiSummary ? (
        <p className="mb-4 rounded-2xl bg-white px-4 py-3 text-sm">
          {call.aiSummary}
        </p>
      ) : null}
      {call.screeningTranscript ? (
        <article className="mb-4 whitespace-pre-wrap rounded-2xl bg-white px-4 py-4 text-[15px] leading-6">
          <h2 className="mb-2 text-xs font-semibold uppercase text-[var(--secondary-label)]">
            Samtal med AI-växeln
          </h2>
          {call.screeningTranscript}
        </article>
      ) : null}
      <article className="whitespace-pre-wrap rounded-2xl bg-white px-4 py-4 text-[15px] leading-6">
        {index >= 0 ? (
          <>
            {text.slice(0, index)}
            <mark className="rounded bg-yellow-200 px-0.5">{quote}</mark>
            {text.slice(index + quote.length)}
          </>
        ) : (
          text
        )}
      </article>
    </>
  );
}
