import "server-only";

import { appUrl } from "@/lib/env";
import { getTwilioCredentials } from "@/lib/providers/config";
import { twilioBasicAuth } from "@/lib/providers/twilio";
import type {
  MessagingProvider,
  SendMmsInput,
  SendSmsInput,
  SendSmsResult,
} from "@/lib/sms/provider";

export class TwilioMessagingProvider implements MessagingProvider {
  readonly name = "twilio";

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    return sendTwilioMessage(input);
  }

  async sendMms(input: SendMmsInput): Promise<SendSmsResult> {
    if (!input.imageUrl) {
      throw new Error("Twilio MMS requires a public media URL");
    }
    return sendTwilioMessage(input, input.imageUrl);
  }
}

async function sendTwilioMessage(
  input: SendSmsInput,
  mediaUrl?: string,
): Promise<SendSmsResult> {
  const credentials = await getTwilioCredentials();
  const body = new URLSearchParams({
    From: input.from ?? credentials.fromNumber,
    To: input.to,
    Body: input.text,
  });
  if (mediaUrl) body.append("MediaUrl", mediaUrl);
  const publicUrl = appUrl();
  if (publicUrl) {
    body.set(
      "StatusCallback",
      new URL("/api/webhooks/twilio/status", publicUrl).toString(),
    );
  }
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
      credentials.accountSid,
    )}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: twilioBasicAuth(
          credentials.apiKeySid,
          credentials.apiKeySecret,
        ),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Twilio send failed (${response.status}): ${(
        await response.text()
      ).slice(0, 300)}`,
    );
  }
  const result = (await response.json()) as { sid?: string; status?: string };
  if (!result.sid) throw new Error("Twilio returned no message SID");
  return {
    providerMessageId: result.sid,
    status: result.status ?? "queued",
  };
}
