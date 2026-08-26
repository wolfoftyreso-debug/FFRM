import { notFound } from "next/navigation";
import { getCallDetail } from "@/lib/review";
import { PageHeader } from "@/components/ui";

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
  const { call, contact } = row;
  const who = contact
    ? contact.displayName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : call.fromNumber;
  const quote = query.quote ?? "";
  const text = call.transcript ?? "No transcript yet.";
  const index = quote ? text.indexOf(quote) : -1;

  return (
    <>
      <PageHeader title={who} subtitle={`${call.direction} · ${call.state}`} />
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
