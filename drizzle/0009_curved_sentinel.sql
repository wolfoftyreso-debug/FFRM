CREATE TABLE "system_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "singleton_key" text DEFAULT 'owner' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_singleton_key_unique" UNIQUE("singleton_key");