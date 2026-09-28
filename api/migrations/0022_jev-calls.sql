CREATE TABLE "jev_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"model" text,
	"input_tokens" integer,
	"duration_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jev_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"template_id" uuid,
	"noul" real NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jev_calls" ADD CONSTRAINT "jev_calls_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jev_calls" ADD CONSTRAINT "jev_calls_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jev_ratings" ADD CONSTRAINT "jev_ratings_call_id_jev_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."jev_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jev_ratings" ADD CONSTRAINT "jev_ratings_template_id_activity_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."activity_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jev_calls_created_at_idx" ON "jev_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "jev_ratings_call_id_idx" ON "jev_ratings" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "jev_ratings_template_id_idx" ON "jev_ratings" USING btree ("template_id");