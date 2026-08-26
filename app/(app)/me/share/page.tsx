import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ContactShareCard } from "@/components/contact-share-card";
import { PageHeader } from "@/components/ui";
import { getOrCreateOwnerShareProfile } from "@/lib/contact-sharing";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dela min kontakt" };

export default async function ShareMyContactPage() {
  const contact = await getOrCreateOwnerShareProfile();
  if (!contact) notFound();
  const shareUrl = `${appUrl() ?? "http://localhost:3000"}/c/${contact.shareToken}`;
  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#007AFF", light: "#FFFFFF" },
  });

  return (
    <>
      <PageHeader
        title="Dela min kontakt"
        subtitle="QR-kod, SMS, mail eller länk."
      />
      <ContactShareCard
        contact={contact}
        shareUrl={shareUrl}
        qrDataUrl={qrDataUrl}
      />
    </>
  );
}
