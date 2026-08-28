import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

/** Mark every activity currently visible in this thread as read. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const updated = await db
    .update(conversations)
    .set({ lastReadAt: new Date() })
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id, lastReadAt: conversations.lastReadAt });
  if (!updated[0]) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lastReadAt: updated[0].lastReadAt });
}
