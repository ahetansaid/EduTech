CREATE TABLE "core"."calendrier" (
	"id" text PRIMARY KEY NOT NULL,
	"annee" text NOT NULL,
	"titre" text NOT NULL,
	"categorie" text NOT NULL,
	"debut" date NOT NULL,
	"fin" date NOT NULL,
	"statut" text DEFAULT 'provisoire' NOT NULL,
	"note" text,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_par" text
);
--> statement-breakpoint
CREATE INDEX "calendrier_annee_idx" ON "core"."calendrier" USING btree ("annee","debut");