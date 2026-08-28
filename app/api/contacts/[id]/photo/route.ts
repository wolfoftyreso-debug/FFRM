import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { normalizeContactPhoto } from "@/lib/contact-photo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  // Only the photo columns: selecting the whole row pulled every other field
  // for a response that is just the image.
  const [contact] = await db
    .select({
      dataBase64: contacts.photoDataBase64,
      mimeType: contacts.photoMimeType,
    })
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (!contact?.dataBase64 || !contact.mimeType) {
    return new Response("not found", { status: 404 });
  }
  return new Response(Buffer.from(contact.dataBase64, "base64"), {
    headers: {
      "content-type": contact.mimeType,
      // Callers address this through a URL versioned by the contact's
      // updatedAt (lib/photo-url.ts), so a changed photo is a changed URL and
      // the bytes behind any one URL never change. Private: personal data
      // must not enter a shared cache.
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Välj en bild.");
    const photo = await normalizeContactPhoto(file);
    const db = await getDb();
    const updated = await db
      .update(contacts)
      .set({
        photoDataBase64: photo.dataBase64,
        photoMimeType: photo.mimeType,
        updatedAt: sql`now()`,
      })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (!updated.length) return new Response("not found", { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const updated = await db
    .update(contacts)
    .set({
      photoDataBase64: null,
      photoMimeType: null,
      updatedAt: sql`now()`,
    })
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length
    ? Response.json({ ok: true })
    : new Response("not found", { status: 404 });
}
