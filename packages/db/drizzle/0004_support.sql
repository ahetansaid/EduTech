CREATE TABLE "core"."tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"auteur_compte_id" text NOT NULL,
	"categorie" text NOT NULL,
	"priorite" text DEFAULT 'normale' NOT NULL,
	"sujet" text NOT NULL,
	"description" text NOT NULL,
	"statut" text DEFAULT 'ouvert' NOT NULL,
	"assigne_compte_id" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	"resolu_le" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."tickets_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"auteur_compte_id" text NOT NULL,
	"auteur_nom" text NOT NULL,
	"de_l_administration" boolean DEFAULT false NOT NULL,
	"contenu" text NOT NULL,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."tickets" ADD CONSTRAINT "tickets_auteur_compte_id_comptes_id_fk" FOREIGN KEY ("auteur_compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tickets" ADD CONSTRAINT "tickets_assigne_compte_id_comptes_id_fk" FOREIGN KEY ("assigne_compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tickets_messages" ADD CONSTRAINT "tickets_messages_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "core"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."tickets_messages" ADD CONSTRAINT "tickets_messages_auteur_compte_id_comptes_id_fk" FOREIGN KEY ("auteur_compte_id") REFERENCES "core"."comptes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tickets_auteur_idx" ON "core"."tickets" USING btree ("auteur_compte_id","maj_le");--> statement-breakpoint
CREATE INDEX "tickets_statut_idx" ON "core"."tickets" USING btree ("statut","maj_le");--> statement-breakpoint
CREATE INDEX "tickets_messages_ticket_idx" ON "core"."tickets_messages" USING btree ("ticket_id","cree_le");