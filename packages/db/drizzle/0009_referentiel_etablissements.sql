CREATE TABLE "core"."referentiel_etablissements" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"sigle" text,
	"type" text NOT NULL,
	"type_libelle" text NOT NULL,
	"niveaux" text[] NOT NULL,
	"statut" text NOT NULL,
	"commune_id" text,
	"rattachement" text,
	"position" geometry(Point, 4326),
	"source" text NOT NULL,
	"preuve" text NOT NULL,
	"remarque" text,
	"importe_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."referentiel_etablissements" ADD CONSTRAINT "referentiel_etablissements_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "core"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referentiel_etab_commune_idx" ON "core"."referentiel_etablissements" USING btree ("commune_id");--> statement-breakpoint
CREATE INDEX "referentiel_etab_position_idx" ON "core"."referentiel_etablissements" USING gist ("position");