"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Sparkles } from "lucide-react";
import { sendConversationMessage } from "@/app/actions";

export function MessageComposer({
  conversationId,
  contactId,
}: {
  conversationId: string;
  contactId: string | null;
}) {
  const [text, setText] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(file: File | null) {
    setImage(file);
    setError(null);
    if (!file) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result));
    reader.onerror = () => setError("Could not preview this image");
    reader.readAsDataURL(file);
  }

  async function draftWithAi() {
    if (!image || !contactId) return;
    setDrafting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("contactId", contactId);
      form.set("image", image);
      const res = await fetch("/api/compose/image-caption", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || !data.message) throw new Error(data.error ?? "Could not draft");
      setText(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft");
    } finally {
      setDrafting(false);
    }
  }

  function submit(formData: FormData) {
    startSending(async () => {
      setError(null);
      try {
        await sendConversationMessage(conversationId, formData);
        setText("");
        onFile(null);
        if (fileRef.current) fileRef.current.value = "";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send");
      }
    });
  }

  return (
    <form
      action={submit}
      className="ios-safe-bottom sticky bottom-16 z-20 -mx-1 mt-3 rounded-2xl border border-black/10 bg-white/90 p-2 shadow-lg backdrop-blur-xl md:bottom-2"
    >
      {preview ? (
        <div className="mb-2 flex items-start gap-2">
          {/* blob URL is a local preview only; sanitized server-side before send. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Attachment preview"
            className="h-24 w-24 rounded-md border border-stone-200 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              onFile(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="text-xs text-stone-400 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      ) : null}
      <textarea
        name="text"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Message… (sending takes over the conversation)"
        className="w-full resize-none rounded-xl border-0 bg-black/[0.045] px-3 py-2 text-[16px] focus:outline-none"
      />
      <input
        ref={fileRef}
        type="file"
        name="image"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        id={`image-${conversationId}`}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <label
            htmlFor={`image-${conversationId}`}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--system-blue)] hover:bg-black/[0.04]"
            aria-label="Attach image"
            title="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
          </label>
          {image && contactId ? (
            <button
              type="button"
              onClick={draftWithAi}
              disabled={drafting}
              className="flex items-center gap-1 rounded-md border border-violet-200 px-2.5 py-1.5 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {drafting ? "Looking…" : "AI write text"}
            </button>
          ) : null}
        </div>
        <button
          disabled={sending || (!text.trim() && !image)}
          className="rounded-full bg-[var(--system-blue)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : `Send ${image ? "MMS" : "SMS"}`}
        </button>
      </div>
      {image ? (
        <p className="mt-1 text-[10px] text-stone-400">
          Images are sanitized and compressed below the 320kB MMS limit.
        </p>
      ) : null}
    </form>
  );
}
