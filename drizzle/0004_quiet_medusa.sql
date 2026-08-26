ALTER TABLE "calls" ADD COLUMN "conversation_id" text;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "storage_url" text;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calls_conversation_idx" ON "calls" USING btree ("conversation_id");