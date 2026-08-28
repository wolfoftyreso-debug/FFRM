"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { sendAssistantMessage } from "@/app/actions";

const SUGGESTIONS = [
  "Who needs my attention?",
  "Which birthdays are coming up?",
  "Show open commitments",
];

export function AssistantComposer() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      setError("");
      try {
        await sendAssistantMessage(formData);
        setText("");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Assistenten kunde inte svara. Försök igen.",
        );
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            type="button"
            key={suggestion}
            onClick={() => setText(suggestion)}
            className="min-h-9 rounded-full bg-white px-3 text-xs font-medium text-[var(--system-blue)]"
          >
            {suggestion}
          </button>
        ))}
      </div>
      <form action={submit}>
        <textarea
          name="text"
          rows={2}
          required
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Fråga din assistent…"
          className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-[16px] focus-visible:ring-2 focus-visible:ring-[var(--system-blue)]"
        />
        {error ? <p className="mt-1 text-sm text-red-600">{error}</p> : null}
        <div className="mt-2 flex justify-end">
          <button
            disabled={pending || !text.trim()}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--system-blue)] px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            {pending ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
