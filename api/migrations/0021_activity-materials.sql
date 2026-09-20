ALTER TABLE "activities" ADD COLUMN "materials" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- The juegos already suggested carry what their template needs, so Con lo
-- mismo (JUG-196) works for a juego the family played before this.
UPDATE "activities" SET "materials" = "activity_templates"."materials"
FROM "activity_templates" WHERE "activity_templates"."id" = "activities"."template_id";
