CREATE TABLE "core"."alertes_securite" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"gravite" text NOT NULL,
	"profil_id" text,
	"cle" text NOT NULL,
	"detail" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"traitee_le" timestamp with time zone,
	"traitee_par" text,
	"suite" text
);
--> statement-breakpoint
CREATE TABLE "core"."cles_fido" (
	"id" text PRIMARY KEY NOT NULL,
	"compte_id" text NOT NULL,
	"cle_publique" text NOT NULL,
	"compteur" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nom" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"utilisee_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."codes_secours" (
	"id" text PRIMARY KEY NOT NULL,
	"compte_id" text NOT NULL,
	"empreinte" text NOT NULL,
	"utilise_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."codes_usage_unique" (
	"id" text PRIMARY KEY NOT NULL,
	"compte_id" text NOT NULL,
	"objet" text NOT NULL,
	"canal" text NOT NULL,
	"empreinte" text NOT NULL,
	"destination_chiffree" text,
	"expire_le" timestamp with time zone NOT NULL,
	"tentatives" integer DEFAULT 0 NOT NULL,
	"utilise_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."messages_sortants" (
	"id" text PRIMARY KEY NOT NULL,
	"compte_id" text,
	"canal" text NOT NULL,
	"destinataire" text NOT NULL,
	"objet" text NOT NULL,
	"texte" text NOT NULL,
	"fournisseur" text NOT NULL,
	"statut" text NOT NULL,
	"erreur" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "courriel" text;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "telephone_verifie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "courriel_verifie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "totp_chiffre" text;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "totp_dernier_pas" integer;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "mfa_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD COLUMN "mfa_verifie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD COLUMN "eleve_jusqu_a" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "core"."alertes_securite" ADD CONSTRAINT "alertes_securite_profil_id_profils_id_fk" FOREIGN KEY ("profil_id") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."alertes_securite" ADD CONSTRAINT "alertes_securite_traitee_par_profils_id_fk" FOREIGN KEY ("traitee_par") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cles_fido" ADD CONSTRAINT "cles_fido_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."codes_secours" ADD CONSTRAINT "codes_secours_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."codes_usage_unique" ADD CONSTRAINT "codes_usage_unique_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."messages_sortants" ADD CONSTRAINT "messages_sortants_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alertes_securite_cle_uq" ON "core"."alertes_securite" USING btree ("cle");--> statement-breakpoint
CREATE INDEX "alertes_securite_date_idx" ON "core"."alertes_securite" USING btree ("cree_le");--> statement-breakpoint
CREATE INDEX "cles_fido_compte_idx" ON "core"."cles_fido" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "codes_secours_compte_idx" ON "core"."codes_secours" USING btree ("compte_id");--> statement-breakpoint
CREATE INDEX "codes_compte_idx" ON "core"."codes_usage_unique" USING btree ("compte_id","cree_le");--> statement-breakpoint
CREATE INDEX "messages_compte_idx" ON "core"."messages_sortants" USING btree ("compte_id","cree_le");