import "server-only";

import { getDb } from "@/lib/db";
import { users, type ReceptionistConfig } from "@/lib/db/schema";
import { parseTimeOfDay, utcToZonedParts } from "@/lib/time";
import { defaultTimezone } from "@/lib/env";

export const DEFAULT_RECEPTIONIST_CONFIG: Required<
  Omit<
    ReceptionistConfig,
    | "licensedHoldAudioUrl"
    | "greetingAudioId"
    | "retryAudioId"
    | "connectAudioId"
    | "callbackAudioId"
  >
> = {
  enabled: false,
  availabilityMode: "AUTO",
  workStart: "08:00",
  workEnd: "17:00",
  activeWindowMinutes: 15,
  greetingText:
    "Välkommen! Du har kommit till min telefonassistent. Säg ditt namn och berätta vad ärendet gäller.",
  retryText:
    "Tack. För att jag ska kunna hjälpa dig behöver jag både ditt namn och vad samtalet gäller. Berätta gärna det nu.",
  connectText:
    "Tack. Vänta kvar ett ögonblick så ska jag försöka koppla dig.",
  callbackText:
    "Tack. Jag kan inte koppla fram samtalet just nu. Skulle jag kunna be honom eller henne ringa upp dig så snart som möjligt?",
};

export async function getReceptionistState() {
  const db = await getDb();
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) return null;
  return {
    owner,
    config: {
      ...DEFAULT_RECEPTIONIST_CONFIG,
      ...(owner.receptionistConfig ?? {}),
    },
  };
}

export function isOwnerAjour(args: {
  config: ReceptionistConfig;
  lastActiveAt: Date | null;
  timezone?: string;
  now?: Date;
}): { available: boolean; reason: string } {
  const mode = args.config.availabilityMode ?? "AUTO";
  if (mode === "AJOUR") return { available: true, reason: "Manuellt ajour" };
  if (mode === "NOT_AJOUR") {
    return { available: false, reason: "Manuellt ej ajour" };
  }

  const now = args.now ?? new Date();
  const timezone = args.timezone ?? defaultTimezone();
  const local = utcToZonedParts(now, timezone);
  if (local.weekday === 0 || local.weekday === 6) {
    return { available: false, reason: "Utanför arbetsdagar" };
  }
  const start = parseTimeOfDay(args.config.workStart ?? "08:00");
  const end = parseTimeOfDay(args.config.workEnd ?? "17:00");
  const minute = local.hour * 60 + local.minute;
  const startMinute = start.hour * 60 + start.minute;
  const endMinute = end.hour * 60 + end.minute;
  const duringWork =
    startMinute <= endMinute
      ? minute >= startMinute && minute < endMinute
      : minute >= startMinute || minute < endMinute;
  if (!duringWork) return { available: false, reason: "Utanför arbetstid" };

  const activeWindow = Math.min(
    120,
    Math.max(1, args.config.activeWindowMinutes ?? 15),
  );
  const active =
    !!args.lastActiveAt &&
    now.getTime() - args.lastActiveAt.getTime() <= activeWindow * 60_000;
  return active
    ? { available: true, reason: `Aktiv i appen senaste ${activeWindow} min` }
    : { available: false, reason: "Ingen aktuell aktivitet i appen" };
}
