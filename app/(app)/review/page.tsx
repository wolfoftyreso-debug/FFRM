import Link from "next/link";
import { listPendingInsights } from "@/lib/review";
import { InsetSection } from "@/components/apple-ui";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quotes" };

export default async function ReviewPage() {
  const insights = await listPendingInsights(100);
  return (
    <>
      <PageHeader
        title="Quotes"
        subtitle="Tap a quote to see the conversation and choose what to do."
      />
      <InsetSection>
        {insights.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--secondary-label)]">
            No quotes waiting.
          </p>
        ) : (
          insights.map(({ insight, contact }) => {
            const name =
              contact?.displayName ||
              [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
              "Unknown";
            return (
              <Link
                key={insight.id}
                href={`/review/${insight.id}`}
                className="ios-hairline block px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase text-[var(--secondary-label)]">
                  {insight.kind} · {name}
                </p>
                <p className="mt-1 text-[16px] font-medium">{insight.summary}</p>
                <blockquote className="mt-2 border-l-2 border-[var(--system-blue)] pl-3 text-sm text-[var(--secondary-label)]">
                  “{insight.quote}”
                </blockquote>
              </Link>
            );
          })
        )}
      </InsetSection>
    </>
  );
}
