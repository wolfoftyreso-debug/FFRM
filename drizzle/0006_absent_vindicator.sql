ALTER TABLE "calls" ADD COLUMN "routed_to_number" text;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_provider_media_unique" ON "media_assets" USING btree ("provider_media_id");