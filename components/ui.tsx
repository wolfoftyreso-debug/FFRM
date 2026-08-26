import Link from "next/link";
import type { ReactNode } from "react";

const badgeStyles: Record<string, string> = {
  // conversation / AI states
  "AI HANDLING": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "NEEDS YOU": "bg-red-50 text-red-700 border-red-200",
  "YOU HANDLING": "bg-blue-50 text-blue-700 border-blue-200",
  PAUSED: "bg-stone-100 text-stone-600 border-stone-200",
  CLOSED: "bg-stone-100 text-stone-500 border-stone-200",
  // execution states
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-red-50 text-red-700 border-red-200",
  RUNNING: "bg-blue-50 text-blue-700 border-blue-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  SKIPPED: "bg-stone-100 text-stone-600 border-stone-200",
  ESCALATED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-stone-100 text-stone-500 border-stone-200",
  // calendar kinds
  AUTOMATIC: "bg-violet-50 text-violet-700 border-violet-200",
  HUMAN: "bg-blue-50 text-blue-700 border-blue-200",
  REMINDER: "bg-amber-50 text-amber-700 border-amber-200",
  DRAFT: "bg-amber-50 text-amber-800 border-amber-200",
  BIRTHDAY: "bg-pink-50 text-pink-700 border-pink-200",
  // misc
  ENABLED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  DISABLED: "bg-stone-100 text-stone-500 border-stone-200",
  SUGGESTED: "bg-amber-50 text-amber-700 border-amber-200",
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function Badge({ label }: { label: string }) {
  const style =
    badgeStyles[label] ?? "bg-stone-100 text-stone-600 border-stone-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide ${style}`}
    >
      {label}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-stone-200 bg-white p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
      {text}
    </p>
  );
}

export function PrimaryButton({
  children,
  type = "submit",
}: {
  children: ReactNode;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  type = "submit",
}: {
  children: ReactNode;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
    >
      {children}
    </Link>
  );
}

export const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-stone-500 focus:outline-none bg-white";
export const labelClass = "block text-sm font-medium text-stone-700";
