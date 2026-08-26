import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/** Twilio's HMAC-SHA1 validation for form-encoded webhooks. */
export function validateTwilioSignature(args: {
  authToken: string;
  url: string;
  params: URLSearchParams;
  signature: string | null;
}): boolean {
  if (!args.signature) return false;
  const sorted = [...new Set(args.params.keys())].sort();
  let payload = args.url;
  for (const key of sorted) {
    for (const value of args.params.getAll(key).sort()) {
      payload += `${key}${value}`;
    }
  }
  const expected = createHmac("sha1", args.authToken)
    .update(payload)
    .digest("base64");
  const actualBuffer = Buffer.from(args.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}
