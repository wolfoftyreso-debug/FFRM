"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";

export function ContactShareActions({
  name,
  shareUrl,
  vcardUrl,
}: {
  name: string;
  shareUrl: string;
  vcardUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const message = `Här är min kontakt: ${shareUrl}`;
  const smsHref = `sms:?&body=${encodeURIComponent(message)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(
    `${name} – kontakt`,
  )}&body=${encodeURIComponent(message)}`;

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  async function share() {
    try {
      const file = await fetchVCard(name, vcardUrl);
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${name} – kontakt`,
          text: "Här är mitt kontaktkort.",
          files: [file],
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: `${name} – kontakt`,
          text: "Här är min kontakt.",
          url: shareUrl,
        });
        return;
      }
      await copyLink();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copyLink();
    }
  }

  const actionClass =
    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl bg-black/[0.05] px-2 text-sm font-semibold text-[var(--system-blue)]";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <a href={smsHref} className={actionClass}>
        <MessageCircle className="h-7 w-7" />
        SMS
      </a>
      <a href={mailHref} className={actionClass}>
        <Mail className="h-7 w-7" />
        Mail
      </a>
      <button type="button" onClick={copyLink} className={actionClass}>
        <Copy className="h-7 w-7" />
        {copied ? "Kopierad" : "Kopiera länk"}
      </button>
      <button type="button" onClick={share} className={actionClass}>
        <Share2 className="h-7 w-7" />
        AirDrop / Dela
      </button>
    </div>
  );
}

export function VCardShareButton({
  name,
  vcardUrl,
}: {
  name: string;
  vcardUrl: string;
}) {
  const [pending, setPending] = useState(false);

  async function share() {
    setPending(true);
    try {
      const file = await fetchVCard(name, vcardUrl);
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `${name} – kontakt`,
          text: "Kontaktkort",
          files: [file],
        });
        return;
      }
      if (file) {
        const href = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = href;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(href);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        window.location.href = vcardUrl;
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={pending}
      className="flex min-w-20 flex-col items-center gap-1.5 text-xs font-medium text-[var(--system-blue)] disabled:opacity-50"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--system-blue)] text-white">
        <Share2 className="h-5 w-5" />
      </span>
      {pending ? "Förbereder…" : "AirDrop / Dela"}
    </button>
  );
}

async function fetchVCard(
  name: string,
  vcardUrl: string,
): Promise<File | null> {
  const response = await fetch(vcardUrl);
  if (!response.ok) return null;
  return new File([await response.blob()], `${safeFilename(name)}.vcf`, {
    type: "text/vcard",
  });
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
