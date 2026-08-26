import "server-only";
import { getElksCredentials } from "@/lib/providers/config";
import { elksBasicAuth } from "@/lib/providers/elks46";
import { appUrl } from "@/lib/env";
import type {
  MessagingProvider,
  SendMmsInput,
  SendSmsInput,
  SendSmsResult,
} from "./provider";

const API_URL = "https://api.46elks.com/a1/sms";
const MMS_API_URL = "https://api.46elks.com/a1/mms";

/**
 * 46elks SMS adapter. Credentials never leave the server.
 * https://46elks.com/docs/send-sms
 */
export class Elks46MessagingProvider implements MessagingProvider {
  readonly name = "46elks";

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const { username, password, fromNumber } = await getElksCredentials();
    const from = input.from ?? fromNumber;

    const body = new URLSearchParams({
      from,
      to: input.to,
      message: input.text,
    });

    // Ask 46elks for delivery reports when the app has a public URL.
    const publicUrl = appUrl();
    if (publicUrl) {
      const token = process.env.WEBHOOK_TOKEN;
      const url = new URL("/api/webhooks/46elks/delivery", publicUrl);
      if (token) url.searchParams.set("token", token);
      body.set("whendelivered", url.toString());
    }

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization:
          elksBasicAuth(username, password),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `46elks send failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as { id?: string; status?: string };
    if (!data.id) {
      throw new Error("46elks send returned no message id");
    }
    return { providerMessageId: data.id, status: data.status ?? "created" };
  }

  async sendMms(input: SendMmsInput): Promise<SendSmsResult> {
    const { username, password, fromNumber } = await getElksCredentials();
    const from = input.from ?? fromNumber;
    const body = new URLSearchParams({
      from,
      to: input.to,
      image: input.imageDataUrl,
    });
    if (input.text.trim()) body.set("message", input.text.trim());

    const res = await fetch(MMS_API_URL, {
      method: "POST",
      headers: {
        Authorization:
          elksBasicAuth(username, password),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `46elks MMS send failed (${res.status}): ${detail.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as { id?: string };
    if (!data.id) throw new Error("46elks MMS send returned no message id");
    return { providerMessageId: data.id, status: "created" };
  }
}
