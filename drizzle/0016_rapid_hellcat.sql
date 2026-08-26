CREATE TABLE "apollo_audiences" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apollo_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"audience_id" text,
	"filters" jsonb NOT NULL,
	"status" text DEFAULT 'SEARCHED' NOT NULL,
	"total_found" integer DEFAULT 0 NOT NULL,
	"enriched_count" integer DEFAULT 0 NOT NULL,
	"phone_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"credits_consumed" real DEFAULT 0 NOT NULL,
	"request_ids" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apollo_prospects" (
	"id" text PRIMARY KEY NOT NULL,
	"list_id" text NOT NULL,
	"apollo_person_id" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"title" text,
	"organization_name" text,
	"organization_domain" text,
	"city" text,
	"state" text,
	"country" text,
	"email" text,
	"phone_number" text,
	"phone_type" text,
	"has_direct_phone" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'FOUND' NOT NULL,
	"contact_id" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apollo_lists" ADD CONSTRAINT "apollo_lists_audience_id_apollo_audiences_id_fk" FOREIGN KEY ("audience_id") REFERENCES "public"."apollo_audiences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apollo_prospects" ADD CONSTRAINT "apollo_prospects_list_id_apollo_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."apollo_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apollo_prospects" ADD CONSTRAINT "apollo_prospects_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apollo_audiences_updated_idx" ON "apollo_audiences" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "apollo_lists_status_idx" ON "apollo_lists" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "apollo_prospects_list_person_unique" ON "apollo_prospects" USING btree ("list_id","apollo_person_id");--> statement-breakpoint
CREATE INDEX "apollo_prospects_person_idx" ON "apollo_prospects" USING btree ("apollo_person_id");--> statement-breakpoint
CREATE INDEX "apollo_prospects_status_idx" ON "apollo_prospects" USING btree ("status");