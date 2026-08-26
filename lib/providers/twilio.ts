import "server-only";

import { getTwilioCredentials } from "@/lib/providers/config";

const API = "https://api.twilio.com/2010-04-01";

export function twilioBasicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

export async function testTwilioConnection(): Promise<void> {
  const credentials = await getTwilioCredentials();
  const response = await fetch(
    `${API}/Accounts/${encodeURIComponent(credentials.accountSid)}.json`,
    {
      headers: {
        Authorization: twilioBasicAuth(
          credentials.apiKeySid,
          credentials.apiKeySecret,
        ),
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `Twilio connection failed (${response.status}): ${(
        await response.text()
      ).slice(0, 200)}`,
    );
  }
}
