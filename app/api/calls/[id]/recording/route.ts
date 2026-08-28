import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { getElksCredentials } from "@/lib/providers/config";
import { elksBasicAuth } from "@/lib/providers/elks46";

/** Authenticated playback; permanent local copy wins over expiring provider URL. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const [call] = await db.select().from(calls).where(eq(calls.id, id));
  if (call?.recordingDataBase64) {
    return new NextResponse(
      Buffer.from(call.recordingDataBase64, "base64"),
      {
        headers: {
          "Content-Type": call.recordingMimeType ?? "audio/wav",
          "Content-Length": String(call.recordingByteSize ?? 0),
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
  if (!call?.recordingUrl) return new NextResponse("not found", { status: 404 });
  const url = new URL(call.recordingUrl);
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "api.46elks.com" &&
      !url.hostname.endsWith(".46elks.com"))
  ) {
    return new NextResponse("invalid recording source", { status: 400 });
  }
  const { username, password } = await getElksCredentials();
  const response = await fetch(url, {
    headers: { Authorization: elksBasicAuth(username, password) },
    redirect: "error",
  });
  if (!response.ok) return new NextResponse("unavailable", { status: 502 });
  return new NextResponse(response.body, {
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "audio/wav",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
