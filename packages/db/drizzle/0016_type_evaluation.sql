ALTER TABLE "core"."notes" ADD COLUMN "type_evaluation" text;--> statement-breakpoint
-- Défense en profondeur : la base refuse toute autre nature d'évaluation.
ALTER TABLE "core"."notes" ADD CONSTRAINT "notes_type_evaluation_ck" CHECK ("type_evaluation" IS NULL OR "type_evaluation" IN ('interrogation', 'devoir', 'composition'));
