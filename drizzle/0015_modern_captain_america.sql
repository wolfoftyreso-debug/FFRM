ALTER TABLE "contacts" ADD COLUMN "photo_data_base64" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "photo_mime_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_data_base64" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "photo_mime_type" text;