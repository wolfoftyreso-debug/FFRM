"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  Mic,
  RotateCcw,
  Square,
} from "lucide-react";

const SCRIPT = [
  "Hej! Det här är min röst. Jag talar lugnt, tydligt och naturligt, precis som i ett vanligt samtal med någon jag känner.",
  "Ibland är jag glad och entusiastisk: vilken fantastisk idé, det här ser jag verkligen fram emot! Ibland behöver jag låta lugn och omtänksam: ta det försiktigt, vi löser det tillsammans.",
  "Jag kan ställa direkta frågor. Hur mår du i dag? Ska vi höras på torsdag klockan nitton? Passar den tolfte september bättre?",
  "Jag läser några siffror och namn: noll, ett, två, tre, sju, elva, tjugofyra och nittiofem. Stockholm, Göteborg, Malmö, Johan, Anna och Erik.",
  "Nu varierar jag tempot och betoningen. Det här är viktigt. Det här är roligt! Det där låter faktiskt lite märkligt, eller hur?",
  "Tack för att du lyssnade. Detta är min egen röst och jag godkänner att den används av min personliga telefonassistent.",
];

export function VoiceCloneRecorder({
  currentVoiceName,
}: {
  currentVoiceName?: string;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  async function start() {
    setStatus("idle");
    setMessage("");
    setBlob(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        setBlob(audio);
        setPreviewUrl(URL.createObjectURL(audio));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start(1000);
      setSeconds(0);
      setRecording(true);
      timerRef.current = setInterval(
        () => setSeconds((value) => value + 1),
        1000,
      );
    } catch {
      setStatus("error");
      setMessage("Microphone access is required. Allow it in your browser.");
    }
  }

  function stop() {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  }

  async function createVoice() {
    if (!blob || !consent || seconds < 30) return;
    setStatus("uploading");
    setMessage("");
    try {
      const form = new FormData();
      form.set(
        "audio",
        new File([blob], "min-rost.webm", { type: blob.type || "audio/webm" }),
      );
      form.set("consent", "own-voice-confirmed");
      const response = await fetch("/api/providers/elevenlabs/clone-voice", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        voiceName?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Voice creation failed");
      }
      setStatus("success");
      setMessage(`${result.voiceName ?? "Min röst"} är skapad och vald.`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Voice creation failed");
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-black/10 bg-black/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[17px] font-semibold">Skapa “Min röst”</h3>
          <p className="mt-1 text-sm text-stone-500">
            Läs hela manuset i ett tyst rum. 60–120 sekunder rekommenderas.
          </p>
        </div>
        {currentVoiceName ? (
          <span className="rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
            {currentVoiceName}
          </span>
        ) : null}
      </div>

      <div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl bg-white p-4 text-[15px] leading-relaxed">
        {SCRIPT.map((paragraph, index) => (
          <p key={paragraph}>
            <span className="mr-2 font-semibold text-[var(--system-blue)]">
              {index + 1}.
            </span>
            {paragraph}
          </p>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={start}
            className="flex min-h-11 items-center gap-2 rounded-full bg-[var(--system-red)] px-4 text-sm font-semibold text-white"
          >
            <Mic className="h-4 w-4" />
            {blob ? "Record again" : "Start recording"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stop}
            className="flex min-h-11 items-center gap-2 rounded-full bg-black px-4 text-sm font-semibold text-white"
          >
            <Square className="h-4 w-4 fill-current" />
            Stop · {formatTime(seconds)}
          </button>
        )}
        {blob ? (
          <button
            type="button"
            onClick={start}
            className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-[var(--system-blue)]"
          >
            <RotateCcw className="h-4 w-4" />
            Re-record
          </button>
        ) : null}
      </div>

      {previewUrl ? (
        <audio controls src={previewUrl} className="mt-3 h-10 w-full" />
      ) : null}
      {blob && seconds < 30 ? (
        <p className="mt-2 text-xs text-[var(--system-orange)]">
          Record at least 30 seconds. 60–120 seconds gives a better result.
        </p>
      ) : null}

      <label className="mt-4 flex items-start gap-3 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-5 w-5 rounded"
        />
        <span>
          Jag bekräftar att detta är min egen röst och samtycker till att den
          klonas och används av min personliga telefonassistent.
        </span>
      </label>

      <button
        type="button"
        disabled={!blob || seconds < 30 || !consent || status === "uploading"}
        onClick={createVoice}
        className="mt-4 flex min-h-11 items-center gap-2 rounded-xl bg-[var(--system-blue)] px-4 text-sm font-semibold text-white disabled:opacity-40"
      >
        {status === "uploading" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : status === "success" ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
        {status === "uploading" ? "Skapar Min röst…" : "Skapa Min röst"}
      </button>
      {message ? (
        <p
          className={`mt-2 text-sm ${
            status === "error" ? "text-red-600" : "text-green-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
