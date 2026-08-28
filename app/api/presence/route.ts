import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureOwner } from "@/lib/auth/owner";

export async function POST() {
  await ensureOwner();
  const db = await getDb();
  await db
    .update(users)
    .set({ lastActiveAt: new Date(), updatedAt: sql`now()` });
  return Response.json({ ok: true });
}
