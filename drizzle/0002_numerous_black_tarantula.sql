CREATE TABLE "media_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"type" text DEFAULT 'IMAGE' NOT NULL,
	"mime_type" text NOT NULL,
	"provider_media_id" text,
	"provider_url" text,
	"data_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"analysis_status" text DEFAULT 'PENDING' NOT NULL,
	"analysis_model" text,
	"analysis_confidence" real,
	"analysis" jsonb,
	"analysis_error" text,
	"analyzed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "content_type" text DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_assets_message_idx" ON "media_assets" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "media_assets_conversation_idx" ON "media_assets" USING btree ("conversation_id");