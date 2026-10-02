CREATE TABLE "core"."defis_webauthn" (
	"empreinte" text PRIMARY KEY NOT NULL,
	"session" text NOT NULL,
	"intention" text NOT NULL,
	"expire_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."lots_interop" (
	"partenaire" text NOT NULL,
	"lot" text NOT NULL,
	"message" text NOT NULL,
	"recu_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lots_interop_partenaire_lot_pk" PRIMARY KEY("partenaire","lot")
);
--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "echecs_mfa" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."comptes" ADD COLUMN "mfa_bloque_jusqu_a" timestamp with time zone;