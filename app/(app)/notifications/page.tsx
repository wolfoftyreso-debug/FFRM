import Link from "next/link";
import { listPendingInsights } from "@/lib/review";
import { listCampaigns } from "@/lib/queries";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { PageHeader } from "@/components/ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.notifications };

export default async function NotificationsPage() {
  const [insights, campaigns] = await Promise.all([
    listPendingInsights(40),
    listCampaigns(8),
  ]);

  return (
    <>
      <PageHeader
        title={TERMS.notifications}
        subtitle={`${TERMS.insights} och ${TERMS.broadcast.toLowerCase()} som behöver dig.`}
      />
      <InsetSection title={TERMS.insights}>
        {insights.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--secondary-label)]">
            Inget väntar.
          </p>
        ) : (
          insights.map(({ insight, contact }) => {
            const name =
              contact?.displayName ||
              [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
              "Unknown";
            return (
              <AppleRow
                key={insight.id}
                href={`/review/${insight.id}`}
                title={insight.summary}
                subtitle={`“${insight.quote}” · ${name}`}
              />
            );
          })
        )}
      </InsetSection>
      <div className="mt-6">
        <InsetSection title={TERMS.broadcast}>
          {campaigns.map((campaign) => (
            <AppleRow
              key={campaign.id}
              href={`/messages/broadcast/${campaign.id}`}
              title={campaign.name}
              subtitle={`${campaign.status} · ${campaign.sentCount}/${campaign.totalCount}`}
            />
          ))}
        </InsetSection>
      </div>
      <Link
        href="/review"
        className="mt-4 block text-center text-sm font-semibold text-[var(--system-blue)]"
      >
        Öppna alla förslag
      </Link>
    </>
  );
}
