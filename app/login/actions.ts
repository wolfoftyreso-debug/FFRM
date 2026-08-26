"use server";

import { redirect } from "next/navigation";
import { createSession, verifyPassword } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    redirect("/login?error=1");
  }
  const db = await getDb();
  const [owner] = await db.select({ id: users.id }).from(users).limit(1);
  if (!owner) {
    await db.insert(users).values({
      name: "Owner",
      preferredLanguage: "sv",
      timezone: process.env.DEFAULT_TIMEZONE ?? "Europe/Stockholm",
      voiceProfile: {
        defaultTone: "warm, informal",
        emojiUsage: "light",
        formality: "casual",
      },
    });
  }
  await createSession();
  redirect("/");
}
