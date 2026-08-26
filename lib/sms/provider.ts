export interface SendSmsInput {
  to: string; // E.164
  text: string;
  from?: string;
}

export interface SendSmsResult {
  providerMessageId: string;
  status: string;
}

export interface SendMmsInput extends SendSmsInput {
  /** Sanitized PNG/JPEG as a data URL. */
  imageDataUrl: string;
  /** Public provider-fetchable URL (required by Twilio). */
  imageUrl?: string;
}

export interface MessagingProvider {
  readonly name: string;
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  sendMms?(input: SendMmsInput): Promise<SendSmsResult>;
}

let providerOverride: MessagingProvider | null = null;

/** Used by tests to substitute a mock provider. */
export function setMessagingProviderForTests(
  provider: MessagingProvider | null,
): void {
  providerOverride = provider;
}

export async function getMessagingProvider(): Promise<MessagingProvider> {
  if (providerOverride) return providerOverride;
  const { getActiveMessagingProvider } = await import(
    "@/lib/providers/selection"
  );
  if ((await getActiveMessagingProvider()) === "twilio") {
    const { TwilioMessagingProvider } = await import("./twilio");
    return new TwilioMessagingProvider();
  }
  const { Elks46MessagingProvider } = await import("./elks46");
  return new Elks46MessagingProvider();
}
