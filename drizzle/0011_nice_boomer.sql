CREATE TABLE "campaign_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"contact_id" text,
	"phone_number" text NOT NULL,
	"first_name" text,
	"rendered_text" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"message_id" text,
	"error" text,
	"sending_started_at" timestamp with time zone,
	"send_attempt_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_text" text NOT NULL,
	"personalized" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_message_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."message_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_recipients_campaign_phone_unique" ON "campaign_recipients" USING btree ("campaign_id","phone_number");--> statement-breakpoint
CREATE INDEX "campaign_recipients_queue_idx" ON "campaign_recipients" USING btree ("status","sending_started_at");--> statement-breakpoint
CREATE INDEX "message_campaigns_status_idx" ON "message_campaigns" USING btree ("status","created_at");