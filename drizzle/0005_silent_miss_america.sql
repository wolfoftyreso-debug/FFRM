ALTER TABLE "automation_executions" ADD COLUMN "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "recording_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "missed_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "voicemail_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_media" ADD COLUMN "analysis_status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_media" ADD COLUMN "retry_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_media" ADD COLUMN "analysis_error" text;--> statement-breakpoint
ALTER TABLE "contact_media" ADD COLUMN "analyzed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "processing_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_open_contact_unique" ON "conversations" USING btree ("contact_id") WHERE "conversations"."status" = 'OPEN' AND "conversations"."contact_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_open_peer_unique" ON "conversations" USING btree ("peer_number") WHERE "conversations"."status" = 'OPEN' AND "conversations"."contact_id" IS NULL AND "conversations"."peer_number" IS NOT NULL;