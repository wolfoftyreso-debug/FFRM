ALTER TABLE "users" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_share_token_unique" UNIQUE("share_token");