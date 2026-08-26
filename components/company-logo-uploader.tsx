"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";

export function CompanyLogoUploader({
  company,
  endpoint,
  initialLogoUrl,
}: {
  company?: string | null;
  endpoint: string;
  initialLogoUrl?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file) return;
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("photo", file);
    try {
      const response = await fetch(endpoint, { method: "POST", body: form });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Kunde inte spara loggan");
      }
      setLogoUrl(`${endpoint}?v=${Date.now()}`);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Kunde inte spara loggan",
      );
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setPending(true);
    setError(null);
    const response = await fetch(endpoint, { method: "DELETE" });
    setPending(false);
    if (!response.ok) {
      setError("Kunde inte ta bort loggan");
      return;
    }
    setLogoUrl(null);
    router.refresh();
  }

  return (
    <div className="mb-5 rounded-2xl border border-black/10 bg-black/[0.02] p-4">
      <p className="mb-3 text-sm font-semibold text-stone-700">Företagslogga</p>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={company ? `Logga för ${company}` : "Företagslogga"}
              width={160}
              height={80}
              unoptimized
              className="max-h-20 w-auto object-contain"
            />
          ) : (
            <ImagePlus className="h-8 w-8 text-[var(--system-gray)]" />
          )}
        </div>
        <div className="flex flex-1 flex-col items-center gap-2 sm:items-start">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
              className="flex min-h-12 items-center gap-2 rounded-xl bg-blue-50 px-4 text-sm font-semibold text-[var(--system-blue)] disabled:opacity-50"
            >
              {pending ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <ImagePlus className="h-5 w-5" />
              )}
              {logoUrl ? "Byt logga" : "Lägg till logga"}
            </button>
            {logoUrl ? (
              <button
                type="button"
                disabled={pending}
                onClick={remove}
                aria-label="Ta bort logga"
                className="flex min-h-12 items-center rounded-xl bg-red-50 px-4 text-[var(--system-red)] disabled:opacity-50"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          <p className="text-center text-xs text-[var(--secondary-label)] sm:text-left">
            Loggan följer med på ditt kontaktkort och i vCard.
          </p>
        </div>
      </div>
      <input
        ref={inputRef}
        data-testid="company-logo-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0] ?? null)}
      />
      {error ? (
        <p className="mt-2 text-sm text-[var(--system-red)]">{error}</p>
      ) : null}
    </div>
  );
}
