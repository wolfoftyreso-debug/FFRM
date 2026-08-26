"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

type Section = "owner" | "callPolicy" | "46elks" | "elevenlabs";

export function AutosaveField({
  section,
  field,
  label,
  defaultValue = "",
  type = "text",
  placeholder,
  options,
  multiline = false,
}: {
  section: Section;
  field: string;
  label: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const [lastSaved, setLastSaved] = useState(defaultValue);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [error, setError] = useState("");

  async function save(next = value) {
    if (next === lastSaved || (type === "password" && !next)) return;
    setStatus("saving");
    setError("");
    try {
      const response = await fetch("/api/settings/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, field, value: next }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "Could not save");
      }
      setLastSaved(next);
      setStatus("saved");
      if (type === "password") {
        setValue("");
        setLastSaved("");
      }
    } catch (saveError) {
      setStatus("error");
      setError(
        saveError instanceof Error ? saveError.message : "Could not save",
      );
    }
  }

  const common = {
    name: field,
    value,
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setValue(event.target.value);
      setStatus("idle" as const);
    },
    onBlur: () => void save(),
    className:
      "mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-[15px] focus:outline-none",
    "aria-invalid": status === "error",
  };

  return (
    <label className="block text-sm font-medium text-stone-700">
      <span className="flex min-h-5 items-center justify-between gap-2">
        {label}
        <SaveState status={status} />
      </span>
      {options ? (
        <select
          {...common}
          onChange={(event) => {
            common.onChange(event);
            void save(event.target.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea {...common} rows={2} placeholder={placeholder} />
      ) : (
        <input
          {...common}
          type={type}
          placeholder={placeholder}
          autoComplete={type === "password" ? "new-password" : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      )}
      {status === "error" ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : null}
    </label>
  );
}

function SaveState({
  status,
}: {
  status: "idle" | "saving" | "saved" | "error";
}) {
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-stone-400">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        Saving
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
        <CheckCircle2 className="h-4 w-4" />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return <AlertCircle className="h-4 w-4 text-red-600" />;
  }
  return null;
}
