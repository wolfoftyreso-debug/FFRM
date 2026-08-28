import { createAutomation } from "@/app/actions";
import { listContacts } from "@/lib/queries";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { AutomationFormFields } from "@/components/automation-form";
import type { Automation } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ny automation" };

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{
    contactId?: string;
    triggerType?: Automation["triggerType"];
  }>;
}) {
  const params = await searchParams;
  const contacts = await listContacts();
  return (
    <>
      <PageHeader title="Ny automation" />
      <Card>
        <form action={createAutomation}>
          <AutomationFormFields
            contacts={contacts}
            defaultContactId={params.contactId}
            defaultTriggerType={params.triggerType}
          />
          <div className="mt-6">
            <PrimaryButton>Skapa automation</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}
