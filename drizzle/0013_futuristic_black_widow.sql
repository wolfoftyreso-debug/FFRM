CREATE TABLE "call_screening_turns" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"attempt" integer NOT NULL,
	"recording_url" text NOT NULL,
	"audio_data_base64" text,
	"audio_mime_type" text,
	"duration_seconds" integer,
	"transcript" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_state" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "caller_name" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "caller_purpose" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_transcript" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_summary" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_urgency" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_decision" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screening_attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "callback_ticket_id" text;--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "screened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "source_call_id" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "repeat_every_minutes" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "notification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "last_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "receptionist_config" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_screening_turns" ADD CONSTRAINT "call_screening_turns_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_screening_turns_call_attempt_unique" ON "call_screening_turns" USING btree ("call_id","attempt");