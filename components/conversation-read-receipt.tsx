"use client";

import { useEffect } from "react";

/**
 * Fire-and-forget read receipt after the thread has actually rendered.
 *
 * `activityKey` is the newest activity the render contains, so a message that
 * arrives live while the thread is open is marked read too instead of leaving
 * the inbox row bold behind the owner's back.
 */
export function ConversationReadReceipt({
  conversationId,
  activityKey,
}: {
  conversationId: string;
  activityKey?: string;
}) {
  useEffect(() => {
    void fetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      // Read state is eventually consistent; reopening the thread retries.
    });
  }, [conversationId, activityKey]);
  return null;
}
