import { startManualConversation } from "@/app/actions";
import { Card, PageHeader, PrimaryButton, inputClass } from "@/components/ui";

export const metadata = { title: "Nytt meddelande" };

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <PageHeader
        title="Nytt meddelande"
        subtitle="Starta en SMS-tråd med ett svenskt eller utländskt nummer."
      />
      <Card className="mx-auto max-w-lg">
        <form action={startManualConversation}>
          <label className="block text-sm font-medium text-[var(--label)]">
            Telefonnummer
            <input
              name="phoneNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+46 70 123 45 67"
              required
              className={inputClass}
            />
          </label>
          {error ? (
            <p className="mt-2 text-sm text-[var(--system-red)]">
              Ange ett giltigt telefonnummer med landskod.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-[var(--secondary-label)]">
            Du får läsa meddelandet innan något skickas.
          </p>
          <div className="mt-5">
            <PrimaryButton>Öppna konversationen</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}

