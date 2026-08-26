"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="ios-inset-group mx-auto max-w-lg px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[var(--system-red)]">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-[var(--secondary-label)]">
        Your changes are still stored when possible. Try loading this view
        again.
      </p>
      <button
        onClick={reset}
        className="mx-auto mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-[var(--system-blue)] px-4 text-sm font-semibold text-white"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
      {error.digest ? (
        <p className="mt-4 text-xs text-[var(--system-gray)]">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
