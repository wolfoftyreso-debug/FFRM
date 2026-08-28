/**
 * The product's domain glossary — one canonical name per concept.
 *
 * This app writes Swedish on the owner's behalf all day; its own surfaces
 * speak the same language, and each domain object has exactly one name. The
 * names live here rather than inline so a concept cannot end up called three
 * things across navigation, headings and tests, which is how "Contacts" /
 * "People" / "Kontakter" and "Quotes" / "insights" happened in the first place.
 *
 * Storage keeps its English identifiers (`contacts`, `conversation_insights`,
 * `reminders`) — this is the presentation vocabulary, not a rename of the
 * schema.
 */

/** Destinations, in the words the owner sees. */
export const TERMS = {
  phone: "Telefon",
  messages: "Meddelanden",
  contacts: "Kontakter",
  contact: "Kontakt",
  more: "Mer",
  conversation: "Konversation",
  /** Bulk SMS. Stored as `message_campaigns`. */
  broadcast: "Massutskick",
  /** AI findings from conversations, awaiting the owner. Stored as `conversation_insights`. */
  insights: "Förslag",
  insight: "Förslag",
  /** Stored as `reminders` with kind=TASK. */
  tasks: "Uppgifter",
  reminders: "Påminnelser",
  /** An AI-written message awaiting approval. Stored as `reminders` with kind=DRAFT. */
  drafts: "Utkast",
  calendar: "Kalender",
  automations: "Automationer",
  /** The audit log. Stored as `activity_log`. */
  activity: "Händelser",
  notifications: "Notiser",
  assistant: "Assistent",
  settings: "Inställningar",
  voicemail: "Röstbrevlåda",
  missedCalls: "Missade samtal",
  callback: "Återuppringning",
  unread: "Olästa",
  needsYou: "Behöver dig",
} as const;

/** Visual weight of a state, independent of the words used to render it. */
export type Tone =
  | "neutral"
  | "positive"
  | "attention"
  | "critical"
  | "info"
  /** Something the system did on its own — the product's violet. */
  | "automatic";

export interface StateLabel {
  label: string;
  tone: Tone;
}

/**
 * What the owner is looking at, in one phrase: who is answering this thread.
 * `status` wins over `aiControlState` — a closed conversation is closed no
 * matter who last held it.
 */
export function conversationState(
  aiControlState: string,
  status: string,
): StateLabel {
  if (status === "CLOSED") return { label: "Avslutad", tone: "neutral" };
  switch (aiControlState) {
    case "ESCALATED":
      return { label: "Behöver dig", tone: "critical" };
    case "USER":
      return { label: "Du svarar", tone: "info" };
    case "PAUSED":
      return { label: "Pausad", tone: "neutral" };
    default:
      return { label: "AI svarar", tone: "positive" };
  }
}

/** What kind of thing the AI noticed. Never render the stored enum. */
export function insightKindLabel(kind: string): string {
  switch (kind) {
    case "DECISION":
      return "Beslut";
    case "NOTE":
      return "Anteckning";
    default:
      return "Förslag";
  }
}

/** How an automation run ended. */
export function executionStatusLabel(status: string): StateLabel {
  switch (status) {
    case "COMPLETED":
      return { label: "Klar", tone: "positive" };
    case "FAILED":
      return { label: "Misslyckades", tone: "critical" };
    case "RUNNING":
      return { label: "Kör", tone: "info" };
    case "PENDING":
      return { label: "Väntar", tone: "attention" };
    case "SKIPPED":
      return { label: "Överhoppad", tone: "neutral" };
    case "ESCALATED":
      return { label: "Behöver dig", tone: "critical" };
    case "CANCELLED":
      return { label: "Avbruten", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

/**
 * The same state in a full sentence, for the places that explain rather than
 * label. Written once so the header, the badge and the sidebar cannot drift
 * into three different accounts of the same situation.
 */
export function conversationStateExplanation(
  aiControlState: string,
  status: string,
): string {
  if (status === "CLOSED") {
    return "Konversationen är avslutad. Ingen svarar förrän du öppnar den igen.";
  }
  switch (aiControlState) {
    case "ESCALATED":
      return "AI:n lämnade över till dig och svarar inte själv.";
    case "USER":
      return "Du sköter den här konversationen. AI:n svarar inte.";
    case "PAUSED":
      return "Pausad. Ingen svarar automatiskt.";
    default:
      return "AI:n svarar på enkla meddelanden inom din policy.";
  }
}

/**
 * Relationship and importance are stored as enums and were previously printed
 * raw ("FAMILY · HIGH"). The stored values stay; only the words change.
 */
export function relationshipTypeLabel(type: string | null): string {
  switch (type) {
    case "FAMILY":
      return "Familj";
    case "FRIEND":
      return "Vän";
    case "PARTNER":
      return "Partner";
    case "WORK":
      return "Arbete";
    case "ACQUAINTANCE":
      return "Bekant";
    case "OTHER":
      return "Övrigt";
    default:
      return type ?? "";
  }
}

export function importanceLabel(level: string | null): string {
  switch (level) {
    case "HIGH":
      return "Hög";
    case "MEDIUM":
      return "Mellan";
    case "LOW":
      return "Låg";
    default:
      return level ?? "";
  }
}
