"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Foreground cadence while the owner is actively using the app. */
const ACTIVE_INTERVAL_MS = 5_000;
/** Cadence once the app has been open but untouched for a while. */
const IDLE_INTERVAL_MS = 20_000;
const IDLE_AFTER_MS = 2 * 60_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * Keeps every server-rendered surface live.
 *
 * Polls the change fingerprint and, when it differs from what the server last
 * rendered, refreshes the current route. `router.refresh()` re-renders Server
 * Components while preserving client state and scroll position, so an incoming
 * SMS, a delivery report or a finished voicemail transcription appears without
 * disturbing a half-written reply.
 *
 * Nothing polls while the tab is hidden; returning to the app checks
 * immediately.
 */
export function LiveRefresh({ version }: { version: string }) {
  const router = useRouter();
  const rendered = useRef(version);

  // What the server just rendered is the baseline for the next comparison.
  useEffect(() => {
    rendered.current = version;
  }, [version]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let request: AbortController | null = null;
    let failures = 0;
    let lastInteractionAt = Date.now();

    const nextDelay = () => {
      if (failures > 0) {
        return Math.min(ACTIVE_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS);
      }
      return Date.now() - lastInteractionAt < IDLE_AFTER_MS
        ? ACTIVE_INTERVAL_MS
        : IDLE_INTERVAL_MS;
    };

    const schedule = () => {
      window.clearTimeout(timer);
      // A hidden tab is resumed by the visibility listener, not by a timer.
      if (stopped || document.visibilityState !== "visible") return;
      timer = window.setTimeout(check, nextDelay());
    };

    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch("/api/live", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`live ${response.status}`);
        const data = (await response.json()) as { version?: unknown };
        failures = 0;
        if (typeof data.version === "string" && data.version !== rendered.current) {
          rendered.current = data.version;
          router.refresh();
        }
      } catch (error) {
        if ((error as Error | null)?.name !== "AbortError") {
          failures = Math.min(failures + 1, 4);
        }
      } finally {
        if (request === controller) request = null;
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastInteractionAt = Date.now();
        void check();
      } else {
        window.clearTimeout(timer);
        request?.abort();
      }
    };
    const onInteraction = () => {
      lastInteractionAt = Date.now();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    for (const event of ["pointerdown", "keydown"] as const) {
      window.addEventListener(event, onInteraction, { passive: true });
    }
    schedule();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      request?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      for (const event of ["pointerdown", "keydown"] as const) {
        window.removeEventListener(event, onInteraction);
      }
    };
  }, [router]);

  return null;
}
