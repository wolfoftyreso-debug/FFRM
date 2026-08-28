import { listCampaigns, listContactOptions } from "@/lib/queries";
import { BroadcastComposer } from "@/components/broadcast-composer";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { Badge, PageHeader } from "@/components/ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.broadcast };

export default async function BroadcastPage() {
  const [contacts, campaigns] = await Promise.all([
    listContactOptions(),
    listCampaigns(8),
  ]);
  return (
    <>
      <PageHeader
        title={TERMS.broadcast}
        subtitle="Skriv ett SMS, välj mottagare, spara utskicket. Sändningen fortsätter i bakgrunden."
      />
      <BroadcastComposer
        contacts={contacts.map((contact) => ({
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          displayName: contact.displayName,
          nickname: contact.nickname,
          phoneNumber: contact.phoneNumber,
        }))}
      />
      {campaigns.length > 0 ? (
        <div className="mt-8">
          <InsetSection title="Sparade utskick">
            {campaigns.map((campaign) => (
              <AppleRow
                key={campaign.id}
                href={`/messages/broadcast/${campaign.id}`}
                title={campaign.name}
                subtitle={`${campaign.sentCount}/${campaign.totalCount} sent`}
                trailing={<Badge label={campaign.status} />}
              />
            ))}
          </InsetSection>
        </div>
      ) : null}
    </>
  );
}
