CREATE TABLE "audio_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"purpose" text NOT NULL,
	"mime_type" text NOT NULL,
	"data_base64" text NOT NULL,
	"byte_size" integer NOT NULL,
	"source_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_settings" (
	"provider" text PRIMARY KEY NOT NULL,
	"encrypted_secrets" text NOT NULL,
	"public_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_test_at" timestamp with time zone,
	"last_test_status" text,
	"last_test_error" text
);
