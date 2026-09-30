CREATE TABLE "core"."attributions" (
	"id" text PRIMARY KEY NOT NULL,
	"profil_id" text NOT NULL,
	"role" text NOT NULL,
	"perimetre" jsonb NOT NULL,
	"organisation_id" text NOT NULL,
	"accordee_par" text,
	"motif" text,
	"du" timestamp with time zone DEFAULT now() NOT NULL,
	"au" timestamp with time zone NOT NULL,
	"revoquee_le" timestamp with time zone,
	"revoquee_par" text,
	"motif_revocation" text
);
--> statement-breakpoint
CREATE TABLE "core"."delegations" (
	"id" text PRIMARY KEY NOT NULL,
	"profil_id" text NOT NULL,
	"organisation_id" text NOT NULL,
	"niveau" integer NOT NULL,
	"roles_delegables" text[] NOT NULL,
	"peut_nommer" boolean DEFAULT false NOT NULL,
	"statut" text NOT NULL,
	"accordee_par" text,
	"validee_par" text,
	"motif" text,
	"du" timestamp with time zone DEFAULT now() NOT NULL,
	"au" timestamp with time zone NOT NULL,
	"revoquee_le" timestamp with time zone,
	"revoquee_par" text
);
--> statement-breakpoint
CREATE TABLE "core"."organisations" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"nom" text NOT NULL,
	"parent_id" text,
	"ministere" text,
	"departement_id" text,
	"circonscription" text,
	"etablissement_id" text,
	"actif" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."attributions" ADD CONSTRAINT "attributions_profil_id_profils_id_fk" FOREIGN KEY ("profil_id") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."attributions" ADD CONSTRAINT "attributions_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "core"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."attributions" ADD CONSTRAINT "attributions_accordee_par_profils_id_fk" FOREIGN KEY ("accordee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."attributions" ADD CONSTRAINT "attributions_revoquee_par_profils_id_fk" FOREIGN KEY ("revoquee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."delegations" ADD CONSTRAINT "delegations_profil_id_profils_id_fk" FOREIGN KEY ("profil_id") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."delegations" ADD CONSTRAINT "delegations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "core"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."delegations" ADD CONSTRAINT "delegations_accordee_par_profils_id_fk" FOREIGN KEY ("accordee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."delegations" ADD CONSTRAINT "delegations_validee_par_profils_id_fk" FOREIGN KEY ("validee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."delegations" ADD CONSTRAINT "delegations_revoquee_par_profils_id_fk" FOREIGN KEY ("revoquee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisations" ADD CONSTRAINT "organisations_parent_id_organisations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "core"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisations" ADD CONSTRAINT "organisations_departement_id_departements_id_fk" FOREIGN KEY ("departement_id") REFERENCES "core"."departements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."organisations" ADD CONSTRAINT "organisations_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attributions_profil_idx" ON "core"."attributions" USING btree ("profil_id");--> statement-breakpoint
CREATE INDEX "attributions_organisation_idx" ON "core"."attributions" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "delegations_profil_idx" ON "core"."delegations" USING btree ("profil_id");--> statement-breakpoint
CREATE INDEX "delegations_organisation_idx" ON "core"."delegations" USING btree ("organisation_id");--> statement-breakpoint
CREATE INDEX "organisations_parent_idx" ON "core"."organisations" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_etablissement_uq" ON "core"."organisations" USING btree ("etablissement_id");