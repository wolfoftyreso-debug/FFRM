"use client";

import { useEffect } from "react";

/** Fire-and-forget read receipt after the thread has actually rendered. */
export function ConversationReadReceipt({
  conversationId,
}: {
  conversationId: string;
}) {
  useEffect(() => {
    void fetch(`/api/conversations/${conversationId}/read`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {
      // Read state is eventually consistent; reopening the thread retries.
    });
  }, [conversationId]);
  return null;
}
