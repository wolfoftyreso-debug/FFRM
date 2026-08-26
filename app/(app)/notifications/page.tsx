import Link from "next/link";
import { listPendingInsights } from "@/lib/review";
import { listCampaigns } from "@/lib/queries";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const [insights, campaigns] = await Promise.all([
    listPendingInsights(40),
    listCampaigns(8),
  ]);

  return (
    <>
      <PageHeader title="Notifications" subtitle="Quotes and batches that need you." />
      <InsetSection title="Quotes">
        {insights.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--secondary-label)]">
            Nothing waiting.
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
        <InsetSection title="Batches">
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
        Open all quotes
      </Link>
    </>
  );
}
