import { notFound } from "next/navigation";
import { getContact, displayName } from "@/lib/queries";
import { updateContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <>
      <PageHeader title={`Edit ${displayName(contact)}`} />
      <Card>
        <form action={updateContact.bind(null, contact.id)}>
          <ContactFormFields contact={contact} />
          <div className="mt-6">
            <PrimaryButton>Save changes</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}
