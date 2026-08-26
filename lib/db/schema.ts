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
import { sql } from "drizzle-orm";
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
  singletonKey: text("singleton_key").notNull().default("owner").unique(),
  name: text("name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  photoDataBase64: text("photo_data_base64"),
  photoMimeType: text("photo_mime_type"),
  /** Unguessable public URL token for the owner's shared contact card. */
  shareToken: text("share_token").unique(),
  preferredLanguage: text("preferred_language").notNull().default("sv"),
  timezone: text("timezone").notNull().default("Europe/Stockholm"),
  /** Communication profile: tone, emoji usage, common expressions, ... */
  voiceProfile: jsonb("voice_profile").$type<VoiceProfile>(),
  /** Global inbound call policy; per-contact settings override. */
  callPolicy: jsonb("call_policy").$type<GlobalCallPolicy>(),
  /** AI receptionist, work-hours, availability and generated voice assets. */
  receptionistConfig: jsonb("receptionist_config").$type<ReceptionistConfig>(),
  /** Privacy-safe app activity heartbeat used by AUTO availability. */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** How inbound calls are handled by default. */
export interface GlobalCallPolicy {
  /** Disposition for known contacts (default RING_THROUGH). */
  knownContacts?: CallDisposition;
  /** Disposition for unknown callers (default SCREEN). */
  unknownCallers?: CallDisposition;
  /** Night window (local time HH:MM). */
  nightStart?: string;
  nightEnd?: string;
  /** Disposition during the night window (default VOICEMAIL). */
  nightAction?: CallDisposition;
  /**
   * Contacts whose relationship vector callThroughPriority is at or above
   * this value ring through even at night (default 85).
   */
  nightPriorityThreshold?: number;
}

export interface ReceptionistConfig {
  enabled?: boolean;
  availabilityMode?: "AUTO" | "AJOUR" | "NOT_AJOUR";
  workStart?: string;
  workEnd?: string;
  activeWindowMinutes?: number;
  greetingText?: string;
  retryText?: string;
  connectText?: string;
  callbackText?: string;
  licensedHoldAudioUrl?: string;
  greetingAudioId?: string;
  retryAudioId?: string;
  connectAudioId?: string;
  callbackAudioId?: string;
}

export type CallDisposition = "RING_THROUGH" | "VOICEMAIL" | "SCREEN" | "REJECT";

/** Per-contact override for inbound call handling. */
export type ContactCallPolicy =
  | "INHERIT"
  | "ALWAYS_RING_THROUGH"
  | "RING_THROUGH_DAYTIME"
  | "VOICEMAIL"
  | "SCREEN"
  | "BLOCK";

/**
 * Relationship ontology: 0–100 dimensions. Multiple things can be true at
 * once ("close friend" AND "colleague"). Shown to the user as a simple label;
 * editable in Advanced relationship.
 */
export interface RelationshipVector {
  personalCloseness?: number;
  professionalRelevance?: number;
  formality?: number;
  trust?: number;
  humorTolerance?: number;
  sensitiveTopicAccess?: number;
  autonomousReplyFreedom?: number;
  proactiveContactDesired?: number;
  callThroughPriority?: number;
  privacySensitivity?: number;
}

/** Style extracted from uploaded conversation screenshots (+ manual edits). */
export interface CommunicationProfile {
  /** How the OWNER writes to this contact. */
  ownerStyle?: StyleProfile;
  /** How the CONTACT writes to the owner. */
  contactStyle?: StyleProfile;
  commonTopics?: string[];
  avoidedTopics?: string[];
  recurringExpressions?: string[];
  whoUsuallyInitiates?: "OWNER" | "CONTACT" | "BALANCED";
  notes?: string;
}

export interface StyleProfile {
  language?: string;
  formality?: number; // 0–1
  averageLength?: "very_short" | "short" | "medium" | "long";
  humor?: number;
  sarcasm?: number;
  emojiFrequency?: number;
  emojiTypes?: string[];
  swearing?: number;
  questionStyle?: string;
  greetingStyle?: string;
  signOffStyle?: string;
  usesNames?: boolean;
}

/** Confidence envelope: what the AI may do per action category. */
export type EnvelopeRule = "AUTO" | "ESCALATE" | "BLOCK";
export type EnvelopeCategory =
  | "SMALL_TALK"
  | "JOKES"
  | "GENERIC_LIFE_QUESTIONS"
  | "KNOWN_SHARED_TOPICS"
  | "SUGGEST_MEETING"
  | "AGREE_SPECIFIC_MEETING"
  | "MONEY_OR_PAYMENT"
  | "PRIVATE_INFORMATION"
  | "FACTUAL_COMMITMENT"
  | "WORK_DECISION"
  | "CONFLICT_OR_EMOTION";
export type ConfidenceEnvelope = Partial<Record<EnvelopeCategory, EnvelopeRule>>;

export interface VoiceProfile {
  defaultTone?: string;
  messageLength?: string;
  emojiUsage?: string;
  punctuationStyle?: string;
  formality?: string;
  humorStyle?: string;
  commonExpressions?: string[];
  avoidExpressions?: string[];
  dialogueOpenings?: string[];
  dialogueClosings?: string[];
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
    photoDataBase64: text("photo_data_base64"),
    photoMimeType: text("photo_mime_type"),
    birthday: date("birthday"),
    /** Recurring Swedish name day (month/day; year-independent). */
    nameDayMonth: integer("name_day_month"),
    nameDayDay: integer("name_day_day"),
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
    // Relationship ontology
    relationshipLabel: text("relationship_label"),
    relationshipDescription: text("relationship_description"),
    relationshipVector: jsonb("relationship_vector").$type<RelationshipVector>(),
    communicationProfile: jsonb("communication_profile").$type<CommunicationProfile>(),
    confidenceEnvelope: jsonb("confidence_envelope").$type<ConfidenceEnvelope>(),
    /** Inbound call handling override; INHERIT uses the global policy. */
    callPolicy: text("call_policy").$type<ContactCallPolicy>().notNull().default("INHERIT"),
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
    /** Owner has read all activity up to this instant. */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  },
  (t) => [
    index("conversations_contact_idx").on(t.contactId),
    uniqueIndex("conversations_open_contact_unique")
      .on(t.contactId)
      .where(sql`${t.status} = 'OPEN' AND ${t.contactId} IS NOT NULL`),
    uniqueIndex("conversations_open_peer_unique")
      .on(t.peerNumber)
      .where(
        sql`${t.status} = 'OPEN' AND ${t.contactId} IS NULL AND ${t.peerNumber} IS NOT NULL`,
      ),
  ],
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
    /** Transport. V1: SMS | MMS. Future: VOICE | EMAIL | ... */
    channel: text("channel").notNull().default("SMS"),
    /** TEXT | IMAGE | TEXT_AND_IMAGE | SYSTEM (future: VIDEO/FILE/LOCATION/AUDIO). */
    contentType: text("content_type").notNull().default("TEXT"),
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
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingAttemptCount: integer("processing_attempt_count")
      .notNull()
      .default(0),
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

export interface MediaAnalysis {
  /** Direct observations only — no inferred make/model/price/etc. */
  caption?: string;
  objects?: string[];
  visibleText?: string[];
  peopleDescription?: string[];
  sceneDescription?: string;
  safetyClassification?: "SAFE" | "SENSITIVE" | "UNSAFE";
  /** Interpretation grounded in message + conversation; kept separate. */
  contextualInterpretation?: string;
}

/** Media attached to a Message. Stored sanitized; provider URL is provenance. */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: id(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("IMAGE"),
    mimeType: text("mime_type").notNull(),
    providerMediaId: text("provider_media_id"),
    providerUrl: text("provider_url"),
    /** Stable authenticated application URL; may later point to private Blob. */
    storageUrl: text("storage_url"),
    /** Sanitized image bytes. Private API route serves this to authenticated UI. */
    dataBase64: text("data_base64"),
    byteSize: integer("byte_size"),
    width: integer("width"),
    height: integer("height"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    analysisStatus: text("analysis_status").notNull().default("PENDING"),
    analysisModel: text("analysis_model"),
    analysisConfidence: real("analysis_confidence"),
    analysis: jsonb("analysis").$type<MediaAnalysis>(),
    analysisError: text("analysis_error"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    processingAttemptCount: integer("processing_attempt_count")
      .notNull()
      .default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("media_assets_message_idx").on(t.messageId),
    index("media_assets_conversation_idx").on(t.conversationId),
    uniqueIndex("media_assets_provider_media_unique").on(t.providerMediaId),
  ],
);

export type TriggerType =
  | "DATE"
  | "BIRTHDAY"
  | "NAME_DAY"
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
  | "GENERATE_DRAFT"
  | "REMIND_USER"
  | "CREATE_TASK"
  | "CREATE_CALENDAR_EVENT"
  | "AI_EVALUATE"
  | "ESCALATE"
  | "UPDATE_CONTACT"
  | "LOG_EVENT"
  | "EXTRACT_INSIGHTS";

export type CalendarActivityKind =
  | "BIRTHDAY"
  | "NAME_DAY"
  | "GRADUATION"
  | "WOMENS_DAY"
  | "MENS_DAY"
  | "VALENTINES_DAY"
  | "ANNIVERSARY"
  | "WEDDING_ANNIVERSARY"
  | "CUSTOM";

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
  /** Calendar-created relationship activity type. */
  eventKind?: CalendarActivityKind;
  /** Keep the selected hour but vary the minute for each yearly occurrence. */
  randomMinute?: boolean;
  /** Stable seed makes scheduling deterministic across dispatcher retries. */
  randomMinuteSeed?: string;
}

export interface ActionConfig {
  /** SEND_SMS: literal message text. */
  text?: string;
  /** GENERATE_SMS / GENERATE_DRAFT / AI_EVALUATE: message purpose. */
  purpose?: string;
  /** GENERATE_SMS / GENERATE_DRAFT: extra instruction for the model. */
  instruction?: string;
  /** REMIND_USER / CREATE_TASK / CREATE_CALENDAR_EVENT: title/description. */
  title?: string;
  description?: string;
  /** REMIND_USER: also notify by SMS to owner (default true). */
  notifyBySms?: boolean;
  /** UPDATE_CONTACT: partial fields to set. */
  fields?: Record<string, unknown>;
  /** EXTRACT_INSIGHTS: rolling source window and per-run contact cap. */
  lookbackHours?: number;
  contactLimit?: number;
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
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
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

export type InsightKind = "DECISION" | "NOTE";
export type InsightSourceType = "MESSAGE" | "CALL";
export type InsightStatus =
  | "PENDING"
  | "HANDLED"
  | "ACTIONED"
  | "DISMISSED";

/**
 * Twice-daily, quote-grounded findings from message and call transcripts.
 * Every item keeps immutable source provenance so the owner can inspect the
 * original wording and surrounding conversation before acting.
 */
export const conversationInsights = pgTable(
  "conversation_insights",
  {
    id: id(),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<InsightKind>().notNull(),
    summary: text("summary").notNull(),
    quote: text("quote").notNull(),
    sourceType: text("source_type").$type<InsightSourceType>().notNull(),
    sourceId: text("source_id").notNull(),
    confidence: real("confidence"),
    status: text("status").$type<InsightStatus>().notNull().default("PENDING"),
    dedupeKey: text("dedupe_key").notNull(),
    extractionExecutionId: text("extraction_execution_id"),
    actionType: text("action_type"),
    actionEntityId: text("action_entity_id"),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversation_insights_dedupe_unique").on(t.dedupeKey),
    index("conversation_insights_status_idx").on(t.status, t.createdAt),
    index("conversation_insights_contact_idx").on(t.contactId),
    index("conversation_insights_source_idx").on(t.sourceType, t.sourceId),
  ],
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
    /** TASK only: deliberately small ticket metadata. */
    priority: text("priority").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH
    assignee: text("assignee"),
    sourceInsightId: text("source_insight_id"),
    /** Callback tickets keep notifying until marked done. */
    sourceCallId: text("source_call_id"),
    repeatEveryMinutes: integer("repeat_every_minutes"),
    notificationCount: integer("notification_count").notNull().default(0),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
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

/** Phone calls on the system's 46elks number. */
export const calls = pgTable(
  "calls",
  {
    id: id(),
    provider: text("provider").notNull().default("46elks"),
    providerCallId: text("provider_call_id").notNull(),
    conversationId: text("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // INBOUND | OUTBOUND
    fromNumber: text("from_number").notNull(),
    toNumber: text("to_number").notNull(),
    routedToNumber: text("routed_to_number"),
    /** RINGING → CONNECTED | VOICEMAIL | MISSED | REJECTED | FAILED | COMPLETED */
    state: text("state").notNull().default("RINGING"),
    /** What the policy engine decided: CONNECT | VOICEMAIL | SCREEN | REJECT. */
    disposition: text("disposition"),
    policyReason: text("policy_reason"),
    durationSeconds: integer("duration_seconds"),
    recordingUrl: text("recording_url"),
    /** Permanent copy fetched within 46elks' 72-hour retention window. */
    recordingDataBase64: text("recording_data_base64"),
    recordingMimeType: text("recording_mime_type"),
    recordingByteSize: integer("recording_byte_size"),
    recordingKind: text("recording_kind"), // CALL | VOICEMAIL | SCREENING
    recordingDurationSeconds: integer("recording_duration_seconds"),
    transcript: text("transcript"),
    aiSummary: text("ai_summary"),
    aiTopic: text("ai_topic"),
    aiRequiresUser: boolean("ai_requires_user"),
    /** AI receptionist gate: identity, purpose, decision and callback linkage. */
    screeningState: text("screening_state"),
    callerName: text("caller_name"),
    callerPurpose: text("caller_purpose"),
    screeningTranscript: text("screening_transcript"),
    screeningSummary: text("screening_summary"),
    screeningQuestion: text("screening_question"),
    screeningQuestionAudioId: text("screening_question_audio_id"),
    screeningUrgency: text("screening_urgency"),
    screeningDecision: text("screening_decision"),
    screeningAttemptCount: integer("screening_attempt_count")
      .notNull()
      .default(0),
    callbackTicketId: text("callback_ticket_id"),
    screenedAt: timestamp("screened_at", { withTimezone: true }),
    /** Set when recording post-processing has been claimed. */
    processedAt: timestamp("processed_at", { withTimezone: true }),
    recordingProcessingStartedAt: timestamp(
      "recording_processing_started_at",
      { withTimezone: true },
    ),
    recordingAttemptCount: integer("recording_attempt_count")
      .notNull()
      .default(0),
    missedNotifiedAt: timestamp("missed_notified_at", { withTimezone: true }),
    voicemailNotifiedAt: timestamp("voicemail_notified_at", {
      withTimezone: true,
    }),
    error: text("error"),
    createdAt: createdAt(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("calls_provider_call_unique").on(t.provider, t.providerCallId),
    index("calls_conversation_idx").on(t.conversationId),
    index("calls_contact_idx").on(t.contactId),
    index("calls_created_idx").on(t.createdAt),
  ],
);

/** Individual gate recordings are retained even when the connected call follows. */
export const callScreeningTurns = pgTable(
  "call_screening_turns",
  {
    id: id(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    recordingUrl: text("recording_url").notNull(),
    audioDataBase64: text("audio_data_base64"),
    audioMimeType: text("audio_mime_type"),
    durationSeconds: integer("duration_seconds"),
    transcript: text("transcript"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("call_screening_turns_call_attempt_unique").on(
      t.callId,
      t.attempt,
    ),
  ],
);

/** Numbers explicitly blocked by the owner (rejected before any policy). */
export const blockedNumbers = pgTable("blocked_numbers", {
  phoneNumber: text("phone_number").primaryKey(), // E.164
  reason: text("reason"),
  createdAt: createdAt(),
});

/** Uploaded conversation screenshots — provenance for communication profiles. */
export const contactMedia = pgTable(
  "contact_media",
  {
    id: id(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("STYLE_SCREENSHOT"),
    mimeType: text("mime_type").notNull(),
    dataBase64: text("data_base64").notNull(),
    analysisStatus: text("analysis_status").notNull().default("PENDING"),
    retryCount: integer("retry_count").notNull().default(0),
    analysisError: text("analysis_error"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("contact_media_contact_idx").on(t.contactId)],
);

/** The owner's assistant chat (single thread). */
export const assistantMessages = pgTable("assistant_messages", {
  id: id(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  createdAt: createdAt(),
});

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

/** Bootstrap-only secret material when Vercel Preview SSO replaces app env auth. */
export const systemSecrets = pgTable("system_secrets", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  createdAt: createdAt(),
});

/** Encrypted runtime provider credentials + non-secret configuration/status. */
export const providerSettings = pgTable("provider_settings", {
  provider: text("provider").primaryKey(), // 46elks | elevenlabs
  encryptedSecrets: text("encrypted_secrets").notNull(),
  publicConfig: jsonb("public_config").$type<Record<string, unknown>>(),
  configuredAt: createdAt(),
  updatedAt: updatedAt(),
  lastTestAt: timestamp("last_test_at", { withTimezone: true }),
  lastTestStatus: text("last_test_status"), // OK | FAILED
  lastTestError: text("last_test_error"),
});

/** Saved multi-recipient SMS batch. Recipients are queued and sent by the dispatcher. */
export const messageCampaigns = pgTable(
  "message_campaigns",
  {
    id: id(),
    name: text("name").notNull(),
    templateText: text("template_text").notNull(),
    personalized: boolean("personalized").notNull().default(false),
    status: text("status").notNull().default("QUEUED"), // QUEUED | SENDING | COMPLETED | CANCELLED
    totalCount: integer("total_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [index("message_campaigns_status_idx").on(t.status, t.createdAt)],
);

export const campaignRecipients = pgTable(
  "campaign_recipients",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => messageCampaigns.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, {
      onDelete: "set null",
    }),
    phoneNumber: text("phone_number").notNull(),
    firstName: text("first_name"),
    renderedText: text("rendered_text").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | SENT | FAILED | SKIPPED
    messageId: text("message_id"),
    error: text("error"),
    sendingStartedAt: timestamp("sending_started_at", { withTimezone: true }),
    sendAttemptCount: integer("send_attempt_count").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("campaign_recipients_campaign_phone_unique").on(
      t.campaignId,
      t.phoneNumber,
    ),
    index("campaign_recipients_queue_idx").on(t.status, t.sendingStartedAt),
  ],
);

/** Generated voicemail/screening prompts served to 46elks via tokenized URL. */
export const audioAssets = pgTable("audio_assets", {
  id: id(),
  provider: text("provider").notNull(),
  purpose: text("purpose").notNull(), // VOICEMAIL_GREETING | SCREEN_GREETING
  mimeType: text("mime_type").notNull(),
  dataBase64: text("data_base64").notNull(),
  byteSize: integer("byte_size").notNull(),
  sourceText: text("source_text"),
  createdAt: createdAt(),
});

export type User = typeof users.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type CallScreeningTurn = typeof callScreeningTurns.$inferSelect;
export type ContactMediaItem = typeof contactMedia.$inferSelect;
export type AssistantMessage = typeof assistantMessages.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
export type ContactFact = typeof contactFacts.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type ConversationInsight = typeof conversationInsights.$inferSelect;
export type Reminder = typeof reminders.$inferSelect;
export type ActivityEntry = typeof activityLog.$inferSelect;
export type ProviderSetting = typeof providerSettings.$inferSelect;
export type AudioAsset = typeof audioAssets.$inferSelect;
export type MessageCampaign = typeof messageCampaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
