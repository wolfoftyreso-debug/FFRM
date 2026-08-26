import "server-only";
import { getElevenLabsConfig } from "./config";

const BASE_URL = "https://api.elevenlabs.io";

export async function listElevenLabsVoices(): Promise<
  { voiceId: string; name: string }[]
> {
  const config = await getElevenLabsConfig();
  const response = await fetch(
    `${BASE_URL}/v2/voices?page_size=100&include_total_count=false`,
    { headers: { "xi-api-key": config.apiKey } },
  );
  if (!response.ok) {
    throw new Error(
      `ElevenLabs voices failed (${response.status}): ${(
        await response.text()
      ).slice(0, 200)}`,
    );
  }
  const data = (await response.json()) as {
    voices?: { voice_id?: string; name?: string }[];
  };
  return (data.voices ?? [])
    .filter((voice) => voice.voice_id)
    .map((voice) => ({
      voiceId: voice.voice_id!,
      name: voice.name ?? voice.voice_id!,
    }));
}

export async function generateElevenLabsSpeech(
  text: string,
): Promise<{ data: Uint8Array; mimeType: string }> {
  const config = await getElevenLabsConfig();
  const response = await fetch(
    `${BASE_URL}/v1/text-to-speech/${encodeURIComponent(
      config.voiceId,
    )}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": config.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed: 1,
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `ElevenLabs speech failed (${response.status}): ${(
        await response.text()
      ).slice(0, 200)}`,
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength === 0 || data.byteLength > 5 * 1024 * 1024) {
    throw new Error("ElevenLabs returned an invalid audio payload");
  }
  return {
    data,
    mimeType: response.headers.get("content-type") ?? "audio/mpeg",
  };
}

