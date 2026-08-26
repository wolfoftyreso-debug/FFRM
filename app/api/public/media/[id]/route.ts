import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { mediaAssets } from "@/lib/db/schema";
import { optionalEnv } from "@/lib/env";

/** Token-protected media URL fetched by Twilio for outbound MMS. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  if (!expected || new URL(request.url).searchParams.get("token") !== expected) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await params;
  const db = await getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, id))
    .limit(1);
  if (!asset?.dataBase64 || !asset.mimeType) {
    return new Response("not found", { status: 404 });
  }
  return new Response(Buffer.from(asset.dataBase64, "base64"), {
    headers: {
      "content-type": asset.mimeType,
      "content-length": String(asset.byteSize ?? 0),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
