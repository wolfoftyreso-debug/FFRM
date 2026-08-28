"use client";

import { useState } from "react";
import {
  createCalendarFromInsight,
  createTicketFromInsight,
  reviewInsight,
} from "@/app/actions";

export function QuoteActions({
  insightId,
  defaultTitle,
  smsHref,
  emailHref,
  quote,
}: {
  insightId: string;
  defaultTitle: string;
  smsHref: string | null;
  emailHref: string | null;
  quote: string;
}) {
  const [mode, setMode] = useState<"idle" | "action" | "ticket" | "calendar">(
    "idle",
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(quote);
    setCopied(true);
  }

  return (
    <div className="ios-safe-bottom sticky bottom-32 space-y-3 rounded-2xl bg-white p-3 shadow-lg md:bottom-2">
      <div className="grid grid-cols-3 gap-2">
        <form action={reviewInsight.bind(null, insightId, "HANDLED")}>
          <button className="min-h-12 w-full rounded-xl bg-[var(--system-green)] text-sm font-semibold text-white">
            Handled
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "idle" ? "action" : "idle")}
          className="min-h-12 rounded-xl bg-[var(--system-yellow,#ffcc00)] text-sm font-semibold text-black"
        >
          Create action
        </button>
        <form
          action={reviewInsight.bind(null, insightId, "DISMISSED")}
          onSubmit={(event) => {
            if (!window.confirm("Dismiss this quote?")) event.preventDefault();
          }}
        >
          <button className="min-h-12 w-full rounded-xl bg-[var(--system-red)] text-sm font-semibold text-white">
            Dismiss
          </button>
        </form>
      </div>

      {mode === "action" ? (
        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setMode("ticket")}
            className="min-h-11 rounded-xl bg-black/[0.05] text-sm font-semibold"
          >
            Create ticket
          </button>
          <button
            type="button"
            onClick={() => setMode("calendar")}
            className="min-h-11 rounded-xl bg-black/[0.05] text-sm font-semibold"
          >
            Create calendar event
          </button>
          {smsHref ? (
            <a
              href={smsHref}
              className="flex min-h-11 items-center justify-center rounded-xl bg-black/[0.05] text-sm font-semibold"
            >
              Send SMS
            </a>
          ) : null}
          {emailHref ? (
            <a
              href={emailHref}
              className="flex min-h-11 items-center justify-center rounded-xl bg-black/[0.05] text-sm font-semibold"
            >
              Send email
            </a>
          ) : null}
          <a
            href={`sms:?&body=${encodeURIComponent(quote)}`}
            className="flex min-h-11 items-center justify-center rounded-xl bg-black/[0.05] text-sm font-semibold"
          >
            Send to colleague
          </a>
          <button
            type="button"
            onClick={copy}
            className="min-h-11 rounded-xl bg-black/[0.05] text-sm font-semibold"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}

      {mode === "ticket" ? (
        <form
          action={createTicketFromInsight.bind(null, insightId)}
          className="space-y-2"
        >
          <input
            name="title"
            defaultValue={defaultTitle}
            className="min-h-11 w-full rounded-xl bg-black/[0.05] px-3"
          />
          <input
            name="dueAt"
            type="datetime-local"
            className="min-h-11 w-full rounded-xl bg-black/[0.05] px-3"
          />
          <button className="min-h-11 w-full rounded-xl bg-[var(--system-blue)] font-semibold text-white">
            Save ticket
          </button>
        </form>
      ) : null}

      {mode === "calendar" ? (
        <form
          action={createCalendarFromInsight.bind(null, insightId)}
          className="space-y-2"
        >
          <input
            name="title"
            defaultValue={defaultTitle}
            className="min-h-11 w-full rounded-xl bg-black/[0.05] px-3"
          />
          <input
            name="dueAt"
            type="datetime-local"
            required
            className="min-h-11 w-full rounded-xl bg-black/[0.05] px-3"
          />
          <button className="min-h-11 w-full rounded-xl bg-[var(--system-blue)] font-semibold text-white">
            Save event
          </button>
        </form>
      ) : null}
    </div>
  );
}
