import { startManualConversation } from "@/app/actions";
import { Card, PageHeader, PrimaryButton, inputClass } from "@/components/ui";

export const metadata = { title: "New message" };

export default async function NewMessagePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <>
      <PageHeader
        title="New message"
        subtitle="Start an SMS thread with any Swedish or international number."
      />
      <Card className="mx-auto max-w-lg">
        <form action={startManualConversation}>
          <label className="block text-sm font-medium text-[var(--label)]">
            Phone number
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
              Enter a valid phone number including country code.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-[var(--secondary-label)]">
            You will review the message before anything is sent.
          </p>
          <div className="mt-5">
            <PrimaryButton>Open conversation</PrimaryButton>
          </div>
        </form>
      </Card>
    </>
  );
}

