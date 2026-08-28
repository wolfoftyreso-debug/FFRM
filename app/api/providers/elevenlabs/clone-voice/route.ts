import { NextResponse } from "next/server";
import {
  cloneElevenLabsVoice,
} from "@/lib/providers/elevenlabs";
import {
  getProviderStatus,
  saveProviderConfig,
  updateProviderTestStatus,
} from "@/lib/providers/config";
import { cleanErrorMessage } from "@/lib/errors";

const SUPPORTED = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
]);

/** Create an Instant Voice Clone of the authenticated owner's own voice. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const audio = form.get("audio");
    const consent = form.get("consent");
    if (consent !== "own-voice-confirmed") {
      throw new Error(
        "You must confirm that this is your own voice and that you consent to cloning it",
      );
    }
    if (!audio || typeof audio === "string" || audio.size === 0) {
      throw new Error("Recording is required");
    }
    const mimeType = audio.type.split(";")[0];
    if (!SUPPORTED.has(mimeType)) {
      throw new Error(`Unsupported audio format: ${mimeType || "unknown"}`);
    }
    const result = await cloneElevenLabsVoice({
      audio: new Uint8Array(await audio.arrayBuffer()),
      mimeType,
      fileName: audio.name || "min-rost.webm",
    });
    const status = await getProviderStatus();
    const current = status.elevenlabs?.publicConfig ?? {};
    await saveProviderConfig("elevenlabs", {}, {
      ...current,
      voiceId: result.voiceId,
      voiceName: "Min röst",
      voiceConsentAt: new Date().toISOString(),
    });
    await updateProviderTestStatus("elevenlabs", true);
    return NextResponse.json({
      ok: true,
      voiceId: result.voiceId,
      voiceName: "Min röst",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cleanErrorMessage(error, 300) },
      { status: 400 },
    );
  }
}
