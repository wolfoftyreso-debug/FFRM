import "server-only";
import { getElksCredentials } from "./config";

export function elksBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function testElksConnection(): Promise<void> {
  const credentials = await getElksCredentials();
  const response = await fetch("https://api.46elks.com/a1/me", {
    headers: {
      Authorization: elksBasicAuth(
        credentials.username,
        credentials.password,
      ),
    },
  });
  if (!response.ok) {
    throw new Error(
      `46elks connection failed (${response.status}): ${(
        await response.text()
      ).slice(0, 200)}`,
    );
  }
}
