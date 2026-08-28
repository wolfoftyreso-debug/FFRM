CREATE TABLE "conversation_insights" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text,
	"conversation_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"quote" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"confidence" real,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"dedupe_key" text NOT NULL,
	"extraction_execution_id" text,
	"action_type" text,
	"action_entity_id" text,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_data_base64" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_mime_type" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_byte_size" integer;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_kind" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "priority" text DEFAULT 'MEDIUM' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "assignee" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_insight_id" text;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_insights" ADD CONSTRAINT "conversation_insights_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_insights_dedupe_unique" ON "conversation_insights" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "conversation_insights_status_idx" ON "conversation_insights" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "conversation_insights_contact_idx" ON "conversation_insights" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "conversation_insights_source_idx" ON "conversation_insights" USING btree ("source_type","source_id");