ALTER TABLE "contacts" ADD COLUMN "name_day_month" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "name_day_day" integer;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_read_at" timestamp with time zone;