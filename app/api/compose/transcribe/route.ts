import { NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/ai/client";
import { optionalEnv } from "@/lib/env";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

/** Speech-to-text for the manual SMS composer. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json({ error: "No recording received" }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Recording is too large (maximum 12 MB)" },
        { status: 413 },
      );
    }
    if (!audio.type.startsWith("audio/")) {
      return NextResponse.json(
        { error: "Unsupported recording format" },
        { status: 415 },
      );
    }
    const result = await transcribeAudio({
      model:
        optionalEnv("AI_MODEL_TRANSCRIBE") ?? "fish-audio/transcribe-1",
      audio: new Uint8Array(await audio.arrayBuffer()),
      purpose: "sms-dictation",
    });
    return NextResponse.json({ text: result.text.trim() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Inspelningen kunde inte tolkas.",
      },
      { status: 500 },
    );
  }
}

