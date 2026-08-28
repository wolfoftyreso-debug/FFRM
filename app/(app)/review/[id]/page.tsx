import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls, contacts, messages } from "@/lib/db/schema";
import { getInsight } from "@/lib/review";
import { QuoteActions } from "@/components/quote-actions";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const insight = await getInsight(id);
  if (!insight) notFound();
  const db = await getDb();
  const [contact] = insight.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, insight.contactId))
    : [];
  const sourceMessages = insight.conversationId
    ? await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, insight.conversationId))
        .limit(40)
    : [];
  const [call] =
    insight.sourceType === "CALL"
      ? await db.select().from(calls).where(eq(calls.id, insight.sourceId))
      : [];

  const transcript =
    call?.transcript ??
    sourceMessages
      .map((message) => message.text)
      .filter(Boolean)
      .join("\n");
  const highlighted = highlightQuote(transcript, insight.quote);
  const smsHref = insight.conversationId
    ? `/messages/${insight.conversationId}?insight=${insight.id}`
    : null;
  const emailHref = contact?.email
    ? `mailto:${contact.email}?subject=${encodeURIComponent(insight.summary)}&body=${encodeURIComponent(insight.quote)}`
    : null;

  return (
    <>
      <PageHeader title="Quote" subtitle={contact?.firstName ?? "Conversation"} />
      <blockquote className="mb-4 rounded-2xl bg-white px-4 py-3 text-[17px] font-medium">
        “{insight.quote}”
      </blockquote>
      <section className="mb-24 whitespace-pre-wrap rounded-2xl bg-white px-4 py-4 text-[15px] leading-6">
        {highlighted}
      </section>
      <QuoteActions
        insightId={insight.id}
        defaultTitle={insight.summary}
        smsHref={smsHref}
        emailHref={emailHref}
        quote={insight.quote}
      />
    </>
  );
}

function highlightQuote(text: string, quote: string) {
  if (!text) return "No transcript stored for this source yet.";
  const index = text.indexOf(quote);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark id="quote" className="rounded bg-yellow-200 px-0.5">
        {quote}
      </mark>
      {text.slice(index + quote.length)}
    </>
  );
}
