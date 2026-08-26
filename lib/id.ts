import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Short, URL-safe, collision-resistant id (time-ordered prefix + randomness). */
export function createId(): string {
  const time = Date.now().toString(36);
  const bytes = randomBytes(10);
  let rand = "";
  for (const b of bytes) rand += ALPHABET[b % 36];
  return `${time}${rand}`;
}
