import { notFound } from "next/navigation";
import { getContact, displayName } from "@/lib/queries";
import { updateContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";
import { ContactPhotoUploader } from "@/components/contact-photo-uploader";

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
        <ContactPhotoUploader
          name={displayName(contact)}
          endpoint={`/api/contacts/${contact.id}/photo`}
          initialPhotoUrl={
            contact.photoDataBase64
              ? `/api/contacts/${contact.id}/photo`
              : null
          }
        />
        <form action={updateContact.bind(null, contact.id)}>
          <ContactFormFields contact={contact} />
          <div className="ios-safe-bottom sticky bottom-32 z-20 -mx-4 mt-6 border-t border-black/10 bg-white/95 px-4 pt-3 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-0">
            <PrimaryButton>Save changes</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}
