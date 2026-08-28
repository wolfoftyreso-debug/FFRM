import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureOwner } from "@/lib/auth/owner";
import { normalizeContactPhoto } from "@/lib/contact-photo";

export async function GET() {
  await ensureOwner();
  const db = await getDb();
  const [owner] = await db
    .select({
      dataBase64: users.photoDataBase64,
      mimeType: users.photoMimeType,
    })
    .from(users)
    .limit(1);
  if (!owner?.dataBase64 || !owner.mimeType) {
    return new Response("not found", { status: 404 });
  }
  return imageResponse(owner.dataBase64, owner.mimeType);
}

export async function POST(request: Request) {
  try {
    await ensureOwner();
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Välj en bild.");
    const photo = await normalizeContactPhoto(file);
    const db = await getDb();
    await db
      .update(users)
      .set({
        photoDataBase64: photo.dataBase64,
        photoMimeType: photo.mimeType,
        updatedAt: sql`now()`,
      });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await ensureOwner();
  const db = await getDb();
  await db
    .update(users)
    .set({
      photoDataBase64: null,
      photoMimeType: null,
      updatedAt: sql`now()`,
    });
  return Response.json({ ok: true });
}

function imageResponse(dataBase64: string, mimeType: string) {
  return new Response(Buffer.from(dataBase64, "base64"), {
    headers: {
      "content-type": mimeType,
      // Addressed through a URL versioned by the owner row's updatedAt
      // (lib/photo-url.ts): a changed photo is a changed URL, so the bytes
      // behind any one URL are stable. Private: personal data.
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
