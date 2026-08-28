import Link from "next/link";
import { listPendingInsights } from "@/lib/review";
import { insightKindLabel } from "@/lib/terminology";
import { InsetSection } from "@/components/apple-ui";
import { PageHeader } from "@/components/ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.insights };

export default async function ReviewPage() {
  const insights = await listPendingInsights(100);
  return (
    <>
      <PageHeader
        title={TERMS.insights}
        subtitle="Sådant AI:n lagt märke till i era samtal. Öppna för att se sammanhanget och avgöra."
      />
      <InsetSection>
        {insights.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--secondary-label)]">
            Inget väntar på dig.
          </p>
        ) : (
          insights.map(({ insight, contact }) => {
            const name =
              contact?.displayName ||
              [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
              "Okänd";
            return (
              <Link
                key={insight.id}
                href={`/review/${insight.id}`}
                className="ios-hairline block px-4 py-3"
              >
                <p className="text-xs font-semibold uppercase text-[var(--secondary-label)]">
                  {insightKindLabel(insight.kind)} · {name}
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
