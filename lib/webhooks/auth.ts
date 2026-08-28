import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { optionalEnv } from "@/lib/env";

/**
 * Shared-token authentication for provider webhooks.
 *
 * Every inbound provider callback is a public endpoint: the proxy lets
 * `/api/webhooks/*` through so 46elks and Apollo can reach it. The `?token=`
 * shared secret is therefore the only thing standing between the internet and
 * a system that answers SMS on the owner's behalf and routes real calls.
 *
 * When `WEBHOOK_TOKEN` is unset the endpoints stay open — a phone that stops
 * accepting calls because an environment variable is missing is its own
 * outage — but the state is no longer invisible: `webhooksAreProtected()`
 * reports it, and System health surfaces it as a warning the owner can act on.
 */
export function webhooksAreProtected(): boolean {
  return optionalEnv("WEBHOOK_TOKEN") !== undefined;
}

/**
 * True when the request may proceed. Rejects only when a token is configured
 * and the caller did not present the matching one.
 */
export function webhookRequestIsAuthorized(request: NextRequest): boolean {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  if (!expected) return true;
  const presented = request.nextUrl.searchParams.get("token");
  if (presented === null) return false;
  // Constant time: a shared secret compared with === leaks its prefix through
  // response timing, and these endpoints are callable by anyone.
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
