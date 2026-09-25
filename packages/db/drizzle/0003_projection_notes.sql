CREATE TABLE "core"."notes" (
	"evenement_id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"classe_id" text NOT NULL,
	"matiere" text NOT NULL,
	"trimestre" integer NOT NULL,
	"note" double precision NOT NULL,
	"note_initiale" double precision NOT NULL,
	"corrigee" boolean DEFAULT false NOT NULL,
	"survenu_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."notes" ADD CONSTRAINT "notes_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_apprenant_idx" ON "core"."notes" USING btree ("apprenant_id","matiere","survenu_le");--> statement-breakpoint
CREATE INDEX "notes_classe_idx" ON "core"."notes" USING btree ("classe_id","matiere");