import Image from "next/image";
import { ContactAvatar, InsetSection } from "@/components/apple-ui";
import { CompanyLogoUploader } from "@/components/company-logo-uploader";
import { ContactShareActions } from "@/components/contact-share-actions";
import type { SharedContact } from "@/lib/contact-sharing";
import { photoUrl } from "@/lib/photo-url";

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
        {contact.jobTitle || contact.company ? (
          <p className="mt-1 text-[15px] text-[var(--secondary-label)]">
            {[contact.jobTitle, contact.company].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-[var(--secondary-label)]">
          {publicView ? "Kontaktkort" : "Dela min kontakt"}
        </p>
        {publicView && contact.companyLogoDataBase64 ? (
          <div className="mx-auto mt-4 flex h-16 w-40 items-center justify-center">
            <Image
              src={`/api/public/contact/${contact.shareToken}/logo`}
              alt={contact.company ? `Logga för ${contact.company}` : "Företagslogga"}
              width={160}
              height={64}
              unoptimized
              className="max-h-16 w-auto object-contain"
            />
          </div>
        ) : null}
      </header>

      {publicView ? null : (
        <CompanyLogoUploader
          company={contact.company}
          endpoint="/api/profile/logo"
          initialLogoUrl={
            photoUrl(
              "/api/profile/logo",
              contact.companyLogoDataBase64,
              contact.updatedAt,
            )
          }
        />
      )}

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
        {contact.company ? (
          <div className="ios-hairline min-h-14 px-4 py-3">
            <span className="block text-xs text-[var(--secondary-label)]">
              Företag
            </span>
            <span className="text-[17px]">{contact.company}</span>
          </div>
        ) : null}
        {contact.jobTitle ? (
          <div className="ios-hairline min-h-14 px-4 py-3">
            <span className="block text-xs text-[var(--secondary-label)]">
              Titel
            </span>
            <span className="text-[17px]">{contact.jobTitle}</span>
          </div>
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
