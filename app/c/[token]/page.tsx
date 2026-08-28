import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { ContactShareCard } from "@/components/contact-share-card";
import { getSharedContact } from "@/lib/contact-sharing";
import { appUrl } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kontaktkort" };

export default async function PublicContactPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contact = await getSharedContact(token);
  if (!contact) notFound();
  const shareUrl = `${appUrl() ?? "http://localhost:3000"}/c/${contact.shareToken}`;
  const qrDataUrl = await QRCode.toDataURL(shareUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#007AFF", light: "#FFFFFF" },
  });

  return (
    <main className="min-h-screen bg-[var(--system-background)] px-4 py-8">
      <ContactShareCard
        contact={contact}
        shareUrl={shareUrl}
        qrDataUrl={qrDataUrl}
        publicView
      />
    </main>
  );
}
