"use client";

import { useMemo, useState } from "react";
import { createBroadcastCampaign } from "@/app/actions";
import { ContactAvatar } from "@/components/apple-ui";
import { parsePhoneList, personalizeBroadcast } from "@/lib/sms/phone-list";

interface ContactOption {
  id: string;
  firstName: string;
  lastName: string | null;
  displayName: string | null;
  nickname: string | null;
  phoneNumber: string | null;
}

export function BroadcastComposer({ contacts }: { contacts: ContactOption[] }) {
  const [text, setText] = useState("");
  const [personalized, setPersonalized] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importedList, setImportedList] = useState("");
  const [importedCount, setImportedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const withPhone = contacts.filter((contact) => contact.phoneNumber);
  const visible = withPhone.filter((contact) => {
    if (!query.trim()) return true;
    const hay = `${contact.firstName} ${contact.lastName ?? ""} ${contact.displayName ?? ""} ${contact.phoneNumber ?? ""}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  });

  const preview = useMemo(
    () => personalizeBroadcast(text || "Hej *namn*", "Anna", personalized),
    [text, personalized],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onFile(file: File | null) {
    if (!file) return;
    const content = await file.text();
    setImportedList(content);
    setImportedCount(parsePhoneList(content).length);
  }

  async function save(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      await createBroadcastCampaign(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save batch");
      setPending(false);
    }
  }

  return (
    <form action={save} className="space-y-4">
      <label className="block text-sm font-medium">
        Message
        <textarea
          name="text"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={personalized ? "Hej *namn*, ..." : "Write the SMS…"}
          className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-[16px]"
        />
      </label>
      <button
        type="button"
        onClick={() => setPersonalized((value) => !value)}
        className={`flex min-h-11 items-center justify-between rounded-2xl px-4 text-sm font-semibold ${
          personalized
            ? "bg-[var(--system-blue)] text-white"
            : "bg-black/[0.05] text-black"
        }`}
      >
        <span>Personligt</span>
        <span>{personalized ? "On · uses *namn*" : "Off"}</span>
      </button>
      {personalized ? (
        <p className="text-sm text-[var(--secondary-label)]">
          Write <code>*namn*</code> where the first name should go. Preview: “{preview}”
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setSelecting((value) => !value)}
        className="flex min-h-11 w-full items-center justify-center rounded-2xl bg-black/[0.05] text-sm font-semibold"
      >
        {selecting ? "Hide list" : "Välj flera"}
      </button>

      {selecting ? (
        <div className="rounded-2xl border border-black/10 bg-white">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search contacts"
              className="min-h-11 flex-1 rounded-xl bg-black/[0.05] px-3 text-[15px]"
            />
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(visible.map((contact) => contact.id)))
              }
              className="text-sm font-semibold text-[var(--system-blue)]"
            >
              All
            </button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {visible.map((contact) => {
              const label =
                contact.displayName ||
                [contact.firstName, contact.lastName].filter(Boolean).join(" ");
              return (
                <label
                  key={contact.id}
                  className="ios-hairline flex min-h-14 items-center gap-3 px-4"
                >
                  <ContactAvatar name={label} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-medium">
                      {label}
                    </span>
                    <span className="block text-xs text-[var(--secondary-label)]">
                      {contact.phoneNumber}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    name="contactId"
                    value={contact.id}
                    checked={selected.has(contact.id)}
                    onChange={() => toggle(contact.id)}
                    className="h-5 w-5"
                  />
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        [...selected].map((id) => (
          <input key={id} type="hidden" name="contactId" value={id} />
        ))
      )}

      <label className="block rounded-2xl border border-dashed border-black/15 px-4 py-4 text-sm">
        <span className="font-semibold">Import number list</span>
        <p className="mt-1 text-[var(--secondary-label)]">
          TXT or CSV. One number per line, or number and name.
        </p>
        <input
          type="file"
          accept=".txt,.csv,.tsv,.text,text/plain,text/csv"
          className="mt-3 block w-full text-sm"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <textarea
          name="importedList"
          value={importedList}
          onChange={(event) => {
            setImportedList(event.target.value);
            setImportedCount(parsePhoneList(event.target.value).length);
          }}
          rows={4}
          placeholder="+46701234567, Anna"
          className="mt-3 w-full rounded-xl bg-black/[0.04] px-3 py-2 text-sm"
        />
        {importedCount > 0 ? (
          <p className="mt-2 text-xs text-[var(--secondary-label)]">
            File contained about {importedCount} numbers.
          </p>
        ) : null}
      </label>

      {error ? (
        <p className="text-sm text-[var(--system-red)]">{error}</p>
      ) : null}
      <input type="hidden" name="personalized" value={personalized ? "1" : ""} />
      <button
        disabled={pending || !text.trim()}
        className="ios-safe-bottom flex min-h-12 w-full items-center justify-center rounded-full bg-[var(--system-blue)] text-base font-semibold text-white disabled:opacity-40"
      >
        {pending
          ? "Saving…"
          : `Save batch · ${selected.size}${importedList.trim() ? " + list" : ""}`}
      </button>
    </form>
  );
}
