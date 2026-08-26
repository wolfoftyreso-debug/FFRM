"use client";

import { useEffect } from "react";

/** Records app activity without requesting motion, location, or background access. */
export function PresenceHeartbeat() {
  useEffect(() => {
    let lastSent = 0;
    const send = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSent < 60_000) return;
      lastSent = now;
      void fetch("/api/presence", { method: "POST", keepalive: true });
    };
    send();
    const events = ["visibilitychange", "focus", "pointerdown", "keydown"] as const;
    for (const event of events) window.addEventListener(event, send, { passive: true });
    const interval = window.setInterval(send, 5 * 60_000);
    return () => {
      for (const event of events) window.removeEventListener(event, send);
      window.clearInterval(interval);
    };
  }, []);
  return null;
}
