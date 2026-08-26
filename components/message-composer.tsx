"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ImagePlus, Mic, Sparkles, Square } from "lucide-react";
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
  const [polishing, setPolishing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

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

  async function polishText() {
    if (!text.trim()) return;
    setPolishing(true);
    setError(null);
    try {
      const res = await fetch("/api/compose/polish-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text)
        throw new Error(data.error ?? "Could not improve text");
      setText(data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not improve text");
    } finally {
      setPolishing(false);
    }
  }

  async function startDictation() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (!audio.size) return;
        setTranscribing(true);
        try {
          const form = new FormData();
          form.set(
            "audio",
            new File([audio], "dictation.webm", { type: audio.type }),
          );
          const response = await fetch("/api/compose/transcribe", {
            method: "POST",
            body: form,
          });
          const data = (await response.json()) as {
            text?: string;
            error?: string;
          };
          if (!response.ok || !data.text)
            throw new Error(data.error ?? "Could not transcribe");
          setText((current) =>
            current.trim() ? `${current.trim()} ${data.text}` : data.text!,
          );
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not transcribe",
          );
        } finally {
          setTranscribing(false);
        }
      };
      recorder.start();
      setRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Microphone is unavailable",
      );
    }
  }

  function stopDictation() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
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
      className="ios-safe-bottom sticky bottom-32 z-20 -mx-1 mt-3 rounded-2xl border border-black/10 bg-white/90 p-2 shadow-lg backdrop-blur-xl md:bottom-2"
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
        <div className="flex flex-wrap gap-1">
          <label
            htmlFor={`image-${conversationId}`}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--system-blue)] hover:bg-black/[0.04]"
            aria-label="Attach image"
            title="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
          </label>
          <button
            type="button"
            onClick={recording ? stopDictation : startDictation}
            disabled={transcribing}
            className={`flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${
              recording
                ? "bg-[var(--system-red)] text-white"
                : "text-[var(--system-blue)] hover:bg-black/[0.04]"
            } disabled:opacity-50`}
            aria-label={recording ? "Stop dictation" : "Dictate message"}
          >
            {recording ? (
              <Square className="h-4 w-4 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
            {recording
              ? "Stop"
              : transcribing
                ? "Transcribing…"
                : "Dictate"}
          </button>
          {text.trim() ? (
            <button
              type="button"
              onClick={polishText}
              disabled={polishing || recording || transcribing}
              className="flex h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              aria-label="Improve text with AI"
            >
              <Sparkles className="h-4 w-4" />
              {polishing ? "Improving…" : "Improve"}
            </button>
          ) : null}
          {image && contactId ? (
            <button
              type="button"
              onClick={draftWithAi}
              disabled={drafting}
              className="flex h-11 items-center gap-1 rounded-full border border-violet-200 px-3 text-xs text-violet-700 hover:bg-violet-50 disabled:opacity-50"
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
