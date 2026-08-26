import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processCallRecording } from "@/lib/voice/process-recording";
import { optionalEnv } from "@/lib/env";

const schema = z.object({
  callid: z.string().min(1),
  wav: z.string().min(1),
  duration: z.string().optional(),
});

/**
 * Recording webhook: persist the WAV URL first, then transcribe/summarize
 * after responding. The cron dispatcher reprocesses anything unfinished
 * (recordings are downloadable for 72 hours).
 */
export async function POST(req: NextRequest) {
  const expectedToken = optionalEnv("WEBHOOK_TOKEN");
  if (expectedToken && req.nextUrl.searchParams.get("token") !== expectedToken) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    const form = await req.formData();
    parsed = schema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const db = await getDb();
  const updated = await db
    .update(calls)
    .set({
      recordingUrl: parsed.wav,
      recordingDurationSeconds: parsed.duration ? Number(parsed.duration) : null,
      state: "VOICEMAIL",
    })
    .where(eq(calls.providerCallId, parsed.callid))
    .returning({ id: calls.id });

  if (updated[0]) {
    waitUntil(processCallRecording(updated[0].id));
  }
  return new NextResponse(null, { status: 200 });
}
