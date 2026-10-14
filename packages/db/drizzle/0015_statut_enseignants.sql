ALTER TABLE "core"."enseignants" ADD COLUMN "statut" text;--> statement-breakpoint
-- Défense en profondeur : l'énumération Drizzle ne vit que dans le code ; la base refuse toute autre valeur.
ALTER TABLE "core"."enseignants" ADD CONSTRAINT "enseignants_statut_ck" CHECK ("statut" IS NULL OR "statut" IN ('ape', 'ace', 'ame', 'vacataire'));
