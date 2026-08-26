"use client";

export function ConfirmForm({
  action,
  label,
  confirmText,
}: {
  action: () => Promise<void>;
  label: string;
  confirmText: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    >
      <button className="min-h-11 text-sm font-medium text-[var(--system-red)]">
        {label}
      </button>
    </form>
  );
}
