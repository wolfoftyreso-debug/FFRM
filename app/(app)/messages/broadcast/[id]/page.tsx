import { notFound } from "next/navigation";
import { getCampaignDetail } from "@/lib/queries";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCampaignDetail(id);
  if (!detail) notFound();
  const { campaign, recipients } = detail;

  return (
    <>
      <PageHeader
        title="Sparat utskick"
        subtitle={`${campaign.sentCount} sent · ${campaign.failedCount} failed · ${campaign.totalCount} total`}
      />
      <p className="mb-4 whitespace-pre-wrap rounded-2xl bg-white px-4 py-3 text-[16px]">
        {campaign.templateText}
      </p>
      <div className="mb-4 flex gap-2">
        <Badge label={campaign.status} />
        {campaign.personalized ? <Badge label="Personligt" tone="info" /> : null}
      </div>
      <InsetSection
        title={
          campaign.totalCount > detail.recipientPreviewLimit
            ? `Recipients · first ${recipients.length} of ${campaign.totalCount}`
            : "Recipients"
        }
      >
        {recipients.map((recipient) => (
          <AppleRow
            key={recipient.id}
            title={recipient.firstName || recipient.phoneNumber}
            subtitle={recipient.renderedText}
            trailing={<Badge label={recipient.status} />}
          />
        ))}
      </InsetSection>
    </>
  );
}
