"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { ContactAvatar } from "@/components/apple-ui";

export function ContactPhotoUploader({
  name,
  endpoint,
  initialPhotoUrl,
}: {
  name: string;
  endpoint: string;
  initialPhotoUrl?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl ?? null);
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
        throw new Error(result.error ?? "Kunde inte spara bilden");
      }
      setPhotoUrl(`${endpoint}?v=${Date.now()}`);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Kunde inte spara bilden",
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
      setError("Kunde inte ta bort bilden");
      return;
    }
    setPhotoUrl(null);
    router.refresh();
  }

  return (
    <div className="mb-5 flex flex-col items-center gap-3">
      <ContactAvatar name={name} size="xl" photoUrl={photoUrl} />
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
            <Camera className="h-5 w-5" />
          )}
          {photoUrl ? "Byt foto" : "Lägg till foto"}
        </button>
        {photoUrl ? (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            aria-label="Ta bort foto"
            className="flex min-h-12 items-center rounded-xl bg-red-50 px-4 text-[var(--system-red)] disabled:opacity-50"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => void upload(event.target.files?.[0] ?? null)}
      />
      {error ? (
        <p className="text-center text-sm text-[var(--system-red)]">{error}</p>
      ) : null}
      <p className="text-center text-xs text-[var(--secondary-label)]">
        Bilden beskärs automatiskt och följer med i kontaktkortet.
      </p>
    </div>
  );
}
