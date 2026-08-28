import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { audioAssets } from "@/lib/db/schema";
import { optionalEnv } from "@/lib/env";

/** Token-protected public audio endpoint consumed by 46elks call actions. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  const token = new URL(req.url).searchParams.get("token");
  if (!expected || token !== expected) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const [asset] = await db
    .select()
    .from(audioAssets)
    .where(eq(audioAssets.id, id));
  if (!asset) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(asset.dataBase64, "base64"), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
