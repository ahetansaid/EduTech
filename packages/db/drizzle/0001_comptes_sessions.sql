CREATE TABLE "core"."comptes" (
	"id" text PRIMARY KEY NOT NULL,
	"identifiant" text NOT NULL,
	"mot_de_passe_hash" text NOT NULL,
	"profil_id" text NOT NULL,
	"actif" boolean DEFAULT true NOT NULL,
	"doit_changer_mot_de_passe" boolean DEFAULT false NOT NULL,
	"echecs_consecutifs" integer DEFAULT 0 NOT NULL,
	"verrouille_jusqu_a" timestamp with time zone,
	"derniere_connexion" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comptes_identifiant_unique" UNIQUE("identifiant")
);
--> statement-breakpoint
CREATE TABLE "core"."notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"destinataire_npi" text NOT NULL,
	"titre" text NOT NULL,
	"texte" text NOT NULL,
	"evenement_id" text,
	"lue" boolean DEFAULT false NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."sessions" (
	"empreinte" text PRIMARY KEY NOT NULL,
	"compte_id" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"expire_le" timestamp with time zone NOT NULL,
	"derniere_activite" timestamp with time zone DEFAULT now() NOT NULL,
	"adresse_ip" text,
	"agent" text,
	"revoquee" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD CONSTRAINT "comptes_profil_id_profils_id_fk" FOREIGN KEY ("profil_id") REFERENCES "core"."profils"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."sessions" ADD CONSTRAINT "sessions_compte_id_comptes_id_fk" FOREIGN KEY ("compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comptes_profil_idx" ON "core"."comptes" USING btree ("profil_id");--> statement-breakpoint
CREATE INDEX "notifications_destinataire_idx" ON "core"."notifications" USING btree ("destinataire_npi","cree_le");--> statement-breakpoint
CREATE INDEX "sessions_compte_idx" ON "core"."sessions" USING btree ("compte_id");