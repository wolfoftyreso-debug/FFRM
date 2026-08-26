import {
  pgTable,
  text,
  boolean,
  integer,
  real,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";

const id = () => text("id").primaryKey().$defaultFn(createId);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date());

/** The system owner. Single row for now; keyed so multi-user remains possible. */
export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  preferredLanguage: text("preferred_language").notNull().default("sv"),
  timezone: text("timezone").notNull().default("Europe/Stockholm"),
  /** Communication profile: tone, emoji usage, common expressions, ... */
  voiceProfile: jsonb("voice_profile").$type<VoiceProfile>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export interface VoiceProfile {
  defaultTone?: string;
  messageLength?: string;
  emojiUsage?: string;
  punctuationStyle?: string;
  formality?: string;
  humorStyle?: string;
  commonExpressions?: string[];
  avoidExpressions?: string[];
}

export interface ContactProfile {
  partner?: string;
  children?: string[];
  familyRelations?: string;
  company?: string;
  jobTitle?: string;
  interests?: string[];
  hobbies?: string[];
  importantTopics?: string[];
  avoidTopics?: string[];
  giftIdeas?: string[];
  foodPreferences?: string;
  places?: string[];
  freeformFacts?: string[];
}

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    displayName: text("display_name"),
    nickname: text("nickname"),
    /** E.164, canonical. */
    phoneNumber: text("phone_number"),
    email: text("email"),
    birthday: date("birthday"),
    relationshipType: text("relationship_type").notNull().default("FRIEND"),
    importance: text("importance").notNull().default("MEDIUM"),
    preferredLanguage: text("preferred_language"),
    timezone: text("timezone"),
    notes: text("notes"),
    profile: jsonb("profile").$type<ContactProfile>(),
    // Relationship profile
    desiredContactCadenceDays: integer("desired_contact_cadence_days"),
    communicationStyle: text("communication_style"),
    emojiStyle: text("emoji_style"),
    humorAllowed: boolean("humor_allowed").notNull().default(true),
    /** 0=MEMORY_ONLY 1=REMIND 2=DRAFT 3=APPROVAL 4=AUTONOMOUS_LOW_RISK */
    autonomyLevel: integer("autonomy_level").notNull().default(1),
    automaticBirthdayGreeting: boolean("automatic_birthday_greeting")
      .notNull()
      .default(false),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("contacts_user_phone_unique").on(t.userId, t.phoneNumber),
    index("contacts_user_idx").on(t.userId),
  ],
);

/** AI- or user-extracted structured facts with provenance. */
export const contactFacts = pgTable(
  "contact_facts",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // LIFE_EVENT | PREFERENCE | FAMILY | WORK | OTHER
    fact: text("fact").notNull(),
    date: date("date"),
    confidence: real("confidence"),
    status: text("status").notNull().default("SUGGESTED"), // SUGGESTED | CONFIRMED | DISMISSED
    createdBy: text("created_by").notNull().default("AI"), // AI | USER
    sourceMessageId: text("source_message_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contact_facts_contact_idx").on(t.contactId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /** For conversations with unknown senders. */
    peerNumber: text("peer_number"),
    channel: text("channel").notNull().default("SMS"),
    status: text("status").notNull().default("OPEN"), // OPEN | CLOSED
    aiControlState: text("ai_control_state").notNull().default("AI"), // AI | USER | PAUSED | ESCALATED
    escalationReason: text("escalation_reason"),
    escalationNotifiedAt: timestamp("escalation_notified_at", {
      withTimezone: true,
    }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastUserMessageAt: timestamp("last_user_message_at", {
      withTimezone: true,
    }),
    lastContactMessageAt: timestamp("last_contact_message_at", {
      withTimezone: true,
    }),
  },
  (t) => [index("conversations_contact_idx").on(t.contactId)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // INBOUND | OUTBOUND
    channel: text("channel").notNull().default("SMS"),
    provider: text("provider").notNull().default("46elks"),
    /** Idempotency key for inbound webhooks and provider correlation for outbound. */
    providerMessageId: text("provider_message_id"),
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    text: text("text").notNull(),
    status: text("status").notNull(), // RECEIVED | PENDING | SENT | DELIVERED | FAILED
    /** Who authored an outbound message. */
    sender: text("sender"), // USER | AI | SYSTEM
    automationExecutionId: text("automation_execution_id"),
    error: text("error"),
    /** Set when inbound processing (triage) has claimed this message. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("messages_provider_message_unique").on(
      t.provider,
      t.direction,
      t.providerMessageId,
    ),
    index("messages_conversation_idx").on(t.conversationId),
    index("messages_contact_idx").on(t.contactId),
  ],
);

export type TriggerType =
  | "DATE"
  | "BIRTHDAY"
  | "ANNIVERSARY"
  | "CRON"
  | "INTERVAL"
  | "NO_CONTACT_FOR"
  | "INCOMING_SMS"
  | "MANUAL"
  | "FOLLOW_UP_DUE"
  | "CUSTOM_EVENT";

export type ActionType =
  | "SEND_SMS"
  | "GENERATE_SMS"
  | "REMIND_USER"
  | "CREATE_TASK"
  | "CREATE_CALENDAR_EVENT"
  | "AI_EVALUATE"
  | "ESCALATE"
  | "UPDATE_CONTACT"
  | "LOG_EVENT";

export interface TriggerConfig {
  /** DATE / ANNIVERSARY: ISO date (YYYY-MM-DD). */
  date?: string;
  /** Local time HH:MM used by DATE/BIRTHDAY/ANNIVERSARY/INTERVAL. */
  time?: string;
  /** INTERVAL / NO_CONTACT_FOR: number of days. */
  days?: number;
  /** CRON: standard 5-field cron expression. */
  cron?: string;
  /** ANNIVERSARY: whether it repeats yearly (default true). */
  yearly?: boolean;
}

export interface ActionConfig {
  /** SEND_SMS: literal message text. */
  text?: string;
  /** GENERATE_SMS / AI_EVALUATE: what kind of message ("birthday", "checkin", ...). */
  purpose?: string;
  /** GENERATE_SMS: extra instruction for the model. */
  instruction?: string;
  /** REMIND_USER / CREATE_TASK / CREATE_CALENDAR_EVENT: title/description. */
  title?: string;
  description?: string;
  /** REMIND_USER: also notify by SMS to owner (default true). */
  notifyBySms?: boolean;
  /** UPDATE_CONTACT: partial fields to set. */
  fields?: Record<string, unknown>;
}

export const automations = pgTable(
  "automations",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description"),
    enabled: boolean("enabled").notNull().default(true),
    triggerType: text("trigger_type").$type<TriggerType>().notNull(),
    triggerConfig: jsonb("trigger_config").$type<TriggerConfig>().notNull().default({}),
    actionType: text("action_type").$type<ActionType>().notNull(),
    actionConfig: jsonb("action_config").$type<ActionConfig>().notNull().default({}),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    /** 0..4, caps what the action may do. */
    autonomyLevel: integer("autonomy_level").notNull().default(1),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automations_due_idx").on(t.enabled, t.nextRunAt)],
);

export const automationExecutions = pgTable(
  "automation_executions",
  {
    id: id(),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    /**
     * Deduplication key for the scheduled occurrence (e.g. "birthday-2026-03-01"
     * or "nocontact-<lastInteractionAt>"). Unique together with automationId —
     * this is what makes the dispatcher idempotent.
     */
    occurrenceKey: text("occurrence_key").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING RUNNING COMPLETED FAILED SKIPPED ESCALATED CANCELLED
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    triggerPayload: jsonb("trigger_payload"),
    contextSnapshot: jsonb("context_snapshot"),
    decision: jsonb("decision"),
    result: jsonb("result"),
    aiModel: text("ai_model"),
    aiInputTokens: integer("ai_input_tokens"),
    aiOutputTokens: integer("ai_output_tokens"),
    error: text("error"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("automation_executions_occurrence_unique").on(
      t.automationId,
      t.occurrenceKey,
    ),
    index("automation_executions_automation_idx").on(t.automationId),
  ],
);

/** Promises/commitments detected in conversations. */
export const commitments = pgTable(
  "commitments",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    /** Who made the promise. */
    madeBy: text("made_by").notNull().default("USER"), // USER | CONTACT
    dueAt: timestamp("due_at", { withTimezone: true }),
    confidence: real("confidence"),
    status: text("status").notNull().default("SUGGESTED"), // SUGGESTED CONFIRMED COMPLETED DISMISSED
    sourceMessageId: text("source_message_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("commitments_contact_idx").on(t.contactId)],
);

/** Reminders, tasks, drafts awaiting approval, and custom calendar events. */
export const reminders = pgTable(
  "reminders",
  {
    id: id(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull().default("REMINDER"), // REMINDER | TASK | EVENT | DRAFT
    title: text("title").notNull(),
    description: text("description"),
    /** For kind=DRAFT: the AI-generated message text awaiting approval. */
    draftText: text("draft_text"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("PENDING"), // PENDING | DONE | DISMISSED
    automationId: text("automation_id"),
    automationExecutionId: text("automation_execution_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("reminders_status_idx").on(t.status, t.dueAt)],
);

/** Global audit log; also drives contact timelines together with messages. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: id(),
    actor: text("actor").notNull(), // USER | AI | SYSTEM | 46ELKS | AUTOMATION
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    conversationId: text("conversation_id"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: createdAt(),
  },
  (t) => [
    index("activity_contact_idx").on(t.contactId, t.createdAt),
    index("activity_created_idx").on(t.createdAt),
  ],
);

/** AI cost/usage tracking. */
export const aiCalls = pgTable("ai_calls", {
  id: id(),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  durationMs: integer("duration_ms"),
  ok: boolean("ok").notNull().default(true),
  error: text("error"),
  createdAt: createdAt(),
});

/** Simple operational health key-value store. */
export const systemState = pgTable("system_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: updatedAt(),
});

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactFact = typeof contactFacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
