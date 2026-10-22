CREATE TABLE "core"."cours" (
	"id" text PRIMARY KEY NOT NULL,
	"etablissement_id" text NOT NULL,
	"classe_id" text NOT NULL,
	"annee_scolaire" text NOT NULL,
	"jour" integer NOT NULL,
	"debut" integer NOT NULL,
	"fin" integer NOT NULL,
	"matiere" text NOT NULL,
	"enseignant_id" text NOT NULL,
	"salle" text,
	CONSTRAINT "cours_plage_ck" CHECK ("core"."cours"."jour" between 1 and 6 and "core"."cours"."debut" >= 360 and "core"."cours"."fin" <= 1200 and "core"."cours"."fin" - "core"."cours"."debut" between 15 and 240)
);
--> statement-breakpoint
ALTER TABLE "core"."cours" ADD CONSTRAINT "cours_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cours" ADD CONSTRAINT "cours_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cours" ADD CONSTRAINT "cours_enseignant_id_enseignants_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cours_classe_idx" ON "core"."cours" USING btree ("classe_id","jour","debut");--> statement-breakpoint
CREATE INDEX "cours_enseignant_idx" ON "core"."cours" USING btree ("enseignant_id","jour","debut");--> statement-breakpoint
CREATE INDEX "cours_etablissement_idx" ON "core"."cours" USING btree ("etablissement_id","annee_scolaire");