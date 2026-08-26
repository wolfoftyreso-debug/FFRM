import { notFound } from "next/navigation";
import { getContact, displayName } from "@/lib/queries";
import { updateContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const contact = await getContact(id);
  if (!contact) notFound();

  return (
    <>
      <PageHeader title={`Edit ${displayName(contact)}`} />
      {error ? (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error === "phone-exists"
            ? "Another contact already uses this phone number."
            : error === "invalid"
              ? "Check the phone number and required fields."
              : "The changes could not be saved. Try again."}
        </p>
      ) : null}
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
