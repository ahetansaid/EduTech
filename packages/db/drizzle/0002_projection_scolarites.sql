CREATE TABLE "core"."scolarites" (
	"apprenant_id" text PRIMARY KEY NOT NULL,
	"classe_id" text,
	"etablissement_id" text,
	"statut" text NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."scolarites" ADD CONSTRAINT "scolarites_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."scolarites" ADD CONSTRAINT "scolarites_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."scolarites" ADD CONSTRAINT "scolarites_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scolarites_classe_idx" ON "core"."scolarites" USING btree ("classe_id");--> statement-breakpoint
CREATE INDEX "scolarites_etablissement_idx" ON "core"."scolarites" USING btree ("etablissement_id","statut");