CREATE TABLE "assistant_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_numbers" (
	"phone_number" text PRIMARY KEY NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text DEFAULT '46elks' NOT NULL,
	"provider_call_id" text NOT NULL,
	"contact_id" text,
	"direction" text NOT NULL,
	"from_number" text NOT NULL,
	"to_number" text NOT NULL,
	"state" text DEFAULT 'RINGING' NOT NULL,
	"disposition" text,
	"policy_reason" text,
	"duration_seconds" integer,
	"recording_url" text,
	"recording_duration_seconds" integer,
	"transcript" text,
	"ai_summary" text,
	"ai_topic" text,
	"ai_requires_user" boolean,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_media" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_id" text NOT NULL,
	"kind" text DEFAULT 'STYLE_SCREENSHOT' NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "relationship_label" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "relationship_description" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "relationship_vector" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "communication_profile" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "confidence_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "call_policy" text DEFAULT 'INHERIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "call_policy" jsonb;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_media" ADD CONSTRAINT "contact_media_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calls_provider_call_unique" ON "calls" USING btree ("provider","provider_call_id");--> statement-breakpoint
CREATE INDEX "calls_contact_idx" ON "calls" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "calls_created_idx" ON "calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "contact_media_contact_idx" ON "contact_media" USING btree ("contact_id");