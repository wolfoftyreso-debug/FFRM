import { createAutomation } from "@/app/actions";
import { listContacts } from "@/lib/queries";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { AutomationFormFields } from "@/components/automation-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "New automation" };

export default async function NewAutomationPage({
  searchParams,
}: {
  searchParams: Promise<{ contactId?: string }>;
}) {
  const params = await searchParams;
  const contacts = await listContacts();
  return (
    <>
      <PageHeader title="New automation" />
      <Card>
        <form action={createAutomation}>
          <AutomationFormFields
            contacts={contacts}
            defaultContactId={params.contactId}
          />
          <div className="mt-6">
            <PrimaryButton>Create automation</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}
