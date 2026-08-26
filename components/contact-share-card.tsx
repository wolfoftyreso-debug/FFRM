import Image from "next/image";
import { ContactAvatar, InsetSection } from "@/components/apple-ui";
import { ContactShareActions } from "@/components/contact-share-actions";
import type { SharedContact } from "@/lib/contact-sharing";

export function ContactShareCard({
  contact,
  shareUrl,
  qrDataUrl,
  publicView = false,
}: {
  contact: SharedContact;
  shareUrl: string;
  qrDataUrl: string;
  publicView?: boolean;
}) {
  const vcardUrl = `/api/public/contact/${contact.shareToken}/vcard`;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="text-center">
        <ContactAvatar
          name={contact.name}
          size="xl"
          photoUrl={
            contact.photoDataBase64
              ? `/api/public/contact/${contact.shareToken}/photo`
              : null
          }
        />
        <h1 className="mt-3 text-[28px] font-bold tracking-tight">
          {contact.name}
        </h1>
        <p className="mt-1 text-sm text-[var(--secondary-label)]">
          {publicView ? "Kontaktkort" : "Dela min kontakt"}
        </p>
      </header>

      <div className="mx-auto w-fit rounded-[28px] bg-white p-4 shadow-sm">
        <Image
          src={qrDataUrl}
          width={280}
          height={280}
          priority
          alt={`QR-kod för ${contact.name}s kontaktkort`}
          className="h-[min(70vw,280px)] w-[min(70vw,280px)]"
        />
      </div>
      <p className="text-center text-sm text-[var(--secondary-label)]">
        Skanna QR-koden för att öppna och spara kontaktkortet.
      </p>

      <ContactShareActions
        name={contact.name}
        shareUrl={shareUrl}
        vcardUrl={vcardUrl}
      />

      <InsetSection title="Kontakt">
        {contact.phoneNumber ? (
          <a
            href={`tel:${contact.phoneNumber}`}
            className="ios-hairline block min-h-14 px-4 py-3"
          >
            <span className="block text-xs text-[var(--secondary-label)]">
              Mobil
            </span>
            <span className="text-[17px] text-[var(--system-blue)]">
              {contact.phoneNumber}
            </span>
          </a>
        ) : null}
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            className="ios-hairline block min-h-14 px-4 py-3"
          >
            <span className="block text-xs text-[var(--secondary-label)]">
              E-post
            </span>
            <span className="break-all text-[17px] text-[var(--system-blue)]">
              {contact.email}
            </span>
          </a>
        ) : null}
        <a
          href={vcardUrl}
          download={`${safeFilename(contact.name)}.vcf`}
          className="flex min-h-14 items-center justify-center px-4 text-[17px] font-semibold text-[var(--system-blue)]"
        >
          Lägg till i Kontakter
        </a>
      </InsetSection>
    </div>
  );
}

function safeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "kontakt"
  );
}
