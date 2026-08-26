import { createContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";
import type { Contact } from "@/lib/db/schema";

export const metadata = { title: "New contact" };

export default async function NewContactPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string; error?: string }>;
}) {
  const params = await searchParams;
  const prefill = params.phone
    ? ({ phoneNumber: params.phone } as Contact)
    : null;
  return (
    <>
      <PageHeader title="New contact" />
      {params.error ? <ContactSaveError code={params.error} /> : null}
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

function ContactSaveError({ code }: { code: string }) {
  const message =
    code === "phone-exists"
      ? "A contact with this phone number already exists."
      : code === "invalid"
        ? "Check the phone number and required fields."
        : "The contact could not be saved. Try again.";
  return (
    <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}
