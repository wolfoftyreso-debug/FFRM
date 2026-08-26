import type {
  CalendarActivityKind,
  TriggerConfig,
} from "@/lib/db/schema";
export type { CalendarActivityKind } from "@/lib/db/schema";

export const CALENDAR_ACTIVITY_KINDS = [
  "BIRTHDAY",
  "NAME_DAY",
  "GRADUATION",
  "WOMENS_DAY",
  "MENS_DAY",
  "VALENTINES_DAY",
  "ANNIVERSARY",
  "WEDDING_ANNIVERSARY",
  "CUSTOM",
] as const;

export const CALENDAR_ACTIVITY_OPTIONS: {
  id: CalendarActivityKind;
  label: string;
  purpose: string;
  fixedMonthDay?: string;
  recurringByDefault: boolean;
}[] = [
  {
    id: "BIRTHDAY",
    label: "Födelsedag",
    purpose: "födelsedag",
    recurringByDefault: true,
  },
  {
    id: "NAME_DAY",
    label: "Namnsdag",
    purpose: "namnsdag",
    recurringByDefault: true,
  },
  {
    id: "GRADUATION",
    label: "Examensdag",
    purpose: "examen",
    recurringByDefault: false,
  },
  {
    id: "WOMENS_DAY",
    label: "Internationella kvinnodagen",
    purpose: "internationella kvinnodagen",
    fixedMonthDay: "03-08",
    recurringByDefault: true,
  },
  {
    id: "MENS_DAY",
    label: "Internationella mansdagen",
    purpose: "internationella mansdagen",
    fixedMonthDay: "11-19",
    recurringByDefault: true,
  },
  {
    id: "VALENTINES_DAY",
    label: "Alla hjärtans dag",
    purpose: "alla hjärtans dag",
    fixedMonthDay: "02-14",
    recurringByDefault: true,
  },
  {
    id: "ANNIVERSARY",
    label: "Jubileum",
    purpose: "jubileum",
    recurringByDefault: true,
  },
  {
    id: "WEDDING_ANNIVERSARY",
    label: "Bröllopsdag",
    purpose: "bröllopsdag",
    recurringByDefault: true,
  },
  {
    id: "CUSTOM",
    label: "Annan aktivitet",
    purpose: "personlig högtid eller aktivitet",
    recurringByDefault: false,
  },
];

export function calendarActivityOption(kind: CalendarActivityKind) {
  return CALENDAR_ACTIVITY_OPTIONS.find((option) => option.id === kind)!;
}

export function isCalendarActivityConfig(
  config: TriggerConfig | null | undefined,
): config is TriggerConfig & { eventKind: CalendarActivityKind } {
  return CALENDAR_ACTIVITY_KINDS.includes(
    config?.eventKind as CalendarActivityKind,
  );
}
