import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";

/** Authenticated media delivery; raw provider URLs are never exposed to UI. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id));
  if (!asset?.dataBase64) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(asset.dataBase64, "base64"), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.byteSize ?? 0),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
