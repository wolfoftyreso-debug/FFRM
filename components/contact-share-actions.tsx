"use client";

import { useState } from "react";
import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";

export function ContactShareActions({
  name,
  shareUrl,
}: {
  name: string;
  shareUrl: string;
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
    if (navigator.share) {
      await navigator.share({
        title: `${name} – kontakt`,
        text: "Här är min kontakt.",
        url: shareUrl,
      });
      return;
    }
    await copyLink();
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
        Dela
      </button>
    </div>
  );
}
