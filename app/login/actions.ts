"use server";

import { redirect } from "next/navigation";
import { createSession, verifyPassword } from "@/lib/auth/session";

export async function login(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    redirect("/login?error=1");
  }
  await createSession();
  redirect("/");
}
