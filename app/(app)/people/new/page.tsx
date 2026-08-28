import { createContact } from "@/app/actions";
import { Card, PageHeader, PrimaryButton } from "@/components/ui";
import { ContactFormFields } from "@/components/contact-form";
import type { Contact } from "@/lib/db/schema";

export const metadata = { title: "Ny kontakt" };

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
      <PageHeader title="Ny kontakt" />
      {params.error ? <ContactSaveError code={params.error} /> : null}
      <Card>
        <form action={createContact}>
          <ContactFormFields contact={prefill} />
          <div className="ios-safe-bottom sticky bottom-32 z-20 -mx-4 mt-6 border-t border-black/10 bg-white/95 px-4 pt-3 backdrop-blur-xl md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-0">
            <PrimaryButton>Skapa kontakt</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}

function ContactSaveError({ code }: { code: string }) {
  const message =
    code === "phone-exists"
      ? "Det finns redan en kontakt med det numret. Öppna den i stället för att skapa en till."
      : code === "invalid"
        ? "Kontrollera telefonnumret och de obligatoriska fälten."
        : "Kontakten kunde inte sparas. Inget ändrades — försök igen.";
  return (
    <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}
