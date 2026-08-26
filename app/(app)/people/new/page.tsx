import { createContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";
import type { Contact } from "@/lib/db/schema";

export const metadata = { title: "New contact" };

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const params = await searchParams;
  const prefill = params.phone
    ? ({ phoneNumber: params.phone } as Contact)
    : null;
  return (
    <>
      <PageHeader title="New contact" />
      <Card>
        <form action={createContact}>
          <ContactFormFields contact={prefill} />
          <div className="mt-6">
            <PrimaryButton>Create contact</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}
