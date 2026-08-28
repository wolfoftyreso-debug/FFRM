"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";

export function PendingActionButton({
  children,
  pendingText = "Working…",
  variant = "plain",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "filled" | "tinted" | "plain" | "destructive";
}) {
  const { pending } = useFormStatus();
  const style = {
    filled: "bg-[var(--system-blue)] text-white",
    tinted: "bg-blue-50 text-[var(--system-blue)]",
    plain: "text-[var(--system-blue)]",
    destructive: "text-[var(--system-red)]",
  }[variant];
  return (
    <button
      disabled={pending}
      aria-busy={pending}
      className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold disabled:opacity-50 ${style}`}
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {pending ? pendingText : children}
    </button>
  );
}
