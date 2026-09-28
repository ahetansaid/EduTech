CREATE TABLE "core"."examens_candidatures" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"apprenant_id" text NOT NULL,
	"centre_id" text NOT NULL,
	"numero_table" text NOT NULL,
	"decision" text,
	"moyenne" numeric(4, 2),
	"mention" text
);
--> statement-breakpoint
CREATE TABLE "core"."examens_centres" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"commune_id" text NOT NULL,
	"capacite" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."examens_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"examen" text NOT NULL,
	"session" text NOT NULL,
	"statut" text DEFAULT 'ouverte' NOT NULL,
	"arret_candidatures" date,
	"publiee_le" date
);
--> statement-breakpoint
ALTER TABLE "core"."examens_candidatures" ADD CONSTRAINT "examens_candidatures_session_id_examens_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "core"."examens_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."examens_candidatures" ADD CONSTRAINT "examens_candidatures_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."examens_candidatures" ADD CONSTRAINT "examens_candidatures_centre_id_examens_centres_id_fk" FOREIGN KEY ("centre_id") REFERENCES "core"."examens_centres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."examens_centres" ADD CONSTRAINT "examens_centres_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "core"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "examens_candidatures_session_table_uq" ON "core"."examens_candidatures" USING btree ("session_id","numero_table");--> statement-breakpoint
CREATE UNIQUE INDEX "examens_candidatures_session_apprenant_uq" ON "core"."examens_candidatures" USING btree ("session_id","apprenant_id");--> statement-breakpoint
CREATE INDEX "examens_candidatures_apprenant_idx" ON "core"."examens_candidatures" USING btree ("apprenant_id");--> statement-breakpoint
CREATE INDEX "examens_centres_commune_idx" ON "core"."examens_centres" USING btree ("commune_id");--> statement-breakpoint
CREATE UNIQUE INDEX "examens_sessions_examen_session_uq" ON "core"."examens_sessions" USING btree ("examen","session");