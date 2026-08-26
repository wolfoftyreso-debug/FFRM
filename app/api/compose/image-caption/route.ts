import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { sanitizeImage } from "@/lib/media/image";
import { buildContactContext } from "@/lib/ai/context";
import { suggestImageMessage } from "@/lib/ai/image-understanding";

/** Authenticated helper for the composer: image → contact-specific text draft. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const contactId = String(form.get("contactId") ?? "");
    const file = form.get("image");
    if (!(file instanceof File) || !contactId) {
      return NextResponse.json({ error: "contactId and image required" }, { status: 400 });
    }
    const db = await getDb();
    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, contactId));
    if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });
    const clean = await sanitizeImage(new Uint8Array(await file.arrayBuffer()));
    const context = await buildContactContext(contact);
    const message = await suggestImageMessage({
      imageBase64: clean.data.toString("base64"),
      mimeType: clean.mimeType,
      context,
    });
    return NextResponse.json({ message });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "caption failed" },
      { status: 400 },
    );
  }
}
