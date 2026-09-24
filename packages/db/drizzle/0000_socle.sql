CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE SCHEMA "audit";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "gouvernance";
--> statement-breakpoint
CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE SCHEMA "registre_simule";
--> statement-breakpoint
CREATE SCHEMA "sensible";
--> statement-breakpoint
CREATE SCHEMA "workflow";
--> statement-breakpoint
CREATE TABLE "core"."affectations" (
	"id" text PRIMARY KEY NOT NULL,
	"enseignant_id" text NOT NULL,
	"etablissement_id" text NOT NULL,
	"fonction" text NOT NULL,
	"valide_du" date DEFAULT current_date NOT NULL,
	"valide_au" date
);
--> statement-breakpoint
CREATE TABLE "core"."apprenants" (
	"id" text PRIMARY KEY NOT NULL,
	"npi" text,
	"statut_identite" text NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"date_naissance" date NOT NULL,
	"sexe" text NOT NULL,
	"besoins_particuliers" boolean DEFAULT false NOT NULL,
	CONSTRAINT "apprenants_npi_unique" UNIQUE("npi")
);
--> statement-breakpoint
CREATE TABLE "sensible"."cas" (
	"id" text PRIMARY KEY NOT NULL,
	"categorie" text NOT NULL,
	"apprenant_id" text NOT NULL,
	"referent_id" text NOT NULL,
	"contenu_chiffre" text NOT NULL,
	"niveau_acces" integer DEFAULT 4 NOT NULL,
	"ouvert_le" timestamp with time zone DEFAULT now() NOT NULL,
	"conserver_jusqu_au" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics"."cellules" (
	"commune_id" text NOT NULL,
	"annee" text NOT NULL,
	"niveau" text NOT NULL,
	"sexe" text NOT NULL,
	"effectif" integer NOT NULL,
	"moy_maths" double precision NOT NULL,
	"et_maths" double precision NOT NULL,
	"moy_francais" double precision NOT NULL,
	"et_francais" double precision NOT NULL,
	CONSTRAINT "cellules_commune_id_annee_niveau_sexe_pk" PRIMARY KEY("commune_id","annee","niveau","sexe")
);
--> statement-breakpoint
CREATE TABLE "core"."certificats" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"examen" text NOT NULL,
	"session" text NOT NULL,
	"mention" text NOT NULL,
	"moyenne" numeric(4, 2) NOT NULL,
	"delivre_le" date NOT NULL,
	"empreinte" text NOT NULL,
	"revoque" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."classes" (
	"id" text PRIMARY KEY NOT NULL,
	"etablissement_id" text NOT NULL,
	"niveau" text NOT NULL,
	"libelle" text NOT NULL,
	"annee_scolaire" text NOT NULL,
	"capacite" integer NOT NULL,
	"enseignant_principal_id" text
);
--> statement-breakpoint
CREATE TABLE "core"."communes" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"departement_id" text NOT NULL,
	"milieu" text NOT NULL,
	"geom" geometry(MultiPolygon, 4326)
);
--> statement-breakpoint
CREATE TABLE "analytics"."communes_annee" (
	"commune_id" text NOT NULL,
	"annee" text NOT NULL,
	"capacite" integer NOT NULL,
	"enseignants" integer NOT NULL,
	"enseignants_qualifies" integer NOT NULL,
	"taux_absenteisme" double precision NOT NULL,
	"taux_abandon" double precision NOT NULL,
	"population_scolarisable" integer NOT NULL,
	"couverture" double precision NOT NULL,
	"fraicheur_jours" integer NOT NULL,
	"examens" jsonb NOT NULL,
	CONSTRAINT "communes_annee_commune_id_annee_pk" PRIMARY KEY("commune_id","annee")
);
--> statement-breakpoint
CREATE TABLE "core"."competences" (
	"id" text PRIMARY KEY NOT NULL,
	"matiere" text NOT NULL,
	"domaine" text NOT NULL,
	"libelle" text NOT NULL,
	"niveaux" text[] NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow"."decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"demande_id" text NOT NULL,
	"etape" text NOT NULL,
	"auteur_id" text NOT NULL,
	"decision" text NOT NULL,
	"motif" text,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow"."demandes" (
	"id" text PRIMARY KEY NOT NULL,
	"modele" text NOT NULL,
	"objet" text NOT NULL,
	"demandeur_id" text NOT NULL,
	"ressource" text,
	"etape_courante" text NOT NULL,
	"statut" text NOT NULL,
	"creee_le" timestamp with time zone DEFAULT now() NOT NULL,
	"echeance" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."departements" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"chef_lieu" text NOT NULL,
	"geom" geometry(MultiPolygon, 4326)
);
--> statement-breakpoint
CREATE TABLE "gouvernance"."elements_donnees" (
	"code" text PRIMARY KEY NOT NULL,
	"definition" text NOT NULL,
	"proprietaire" text NOT NULL,
	"gestionnaire" text NOT NULL,
	"source_reference" text NOT NULL,
	"regle_qualite" text,
	"politique_acces" text NOT NULL,
	"sensibilite" integer NOT NULL,
	"conservation" text NOT NULL,
	"finalite" text NOT NULL,
	"frequence" text NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."enseignants" (
	"id" text PRIMARY KEY NOT NULL,
	"npi" text NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"sexe" text NOT NULL,
	"matieres" text[] NOT NULL,
	"etablissement_id" text NOT NULL,
	"grade" text NOT NULL,
	"date_recrutement" date NOT NULL,
	CONSTRAINT "enseignants_npi_unique" UNIQUE("npi")
);
--> statement-breakpoint
CREATE TABLE "core"."enseignements" (
	"enseignant_id" text NOT NULL,
	"classe_id" text NOT NULL,
	"matiere" text NOT NULL,
	CONSTRAINT "enseignements_enseignant_id_classe_id_matiere_pk" PRIMARY KEY("enseignant_id","classe_id","matiere")
);
--> statement-breakpoint
CREATE TABLE "core"."etablissements" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type_institution" text NOT NULL,
	"ministere_tutelle" text NOT NULL,
	"cycle" text NOT NULL,
	"statut" text NOT NULL,
	"gestionnaire" text,
	"agrement" text,
	"commune_id" text NOT NULL,
	"circonscription" text NOT NULL,
	"position" geometry(Point, 4326),
	"capacite" integer NOT NULL,
	"salles_de_classe" integer NOT NULL,
	"infrastructures" jsonb NOT NULL,
	"effectif_declare" integer NOT NULL,
	"enseignants_declares" integer NOT NULL,
	"transmis" boolean DEFAULT true NOT NULL,
	"pilote" boolean DEFAULT false NOT NULL,
	"valide_du" date DEFAULT current_date NOT NULL,
	"valide_au" date
);
--> statement-breakpoint
CREATE TABLE "ledger"."evenements" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"survenu_le" timestamp with time zone NOT NULL,
	"enregistre_le" timestamp with time zone DEFAULT now() NOT NULL,
	"auteur_id" text NOT NULL,
	"source" text NOT NULL,
	"etablissement_id" text,
	"apprenant_id" text,
	"enseignant_id" text,
	"donnees" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit"."journal" (
	"id" text PRIMARY KEY NOT NULL,
	"horodatage" timestamp with time zone DEFAULT now() NOT NULL,
	"profil_id" text NOT NULL,
	"profil_nom" text NOT NULL,
	"action" text NOT NULL,
	"ressource" text NOT NULL,
	"finalite" text NOT NULL,
	"autorise" boolean NOT NULL,
	"critere_manquant" text
);
--> statement-breakpoint
CREATE TABLE "core"."liens_familiaux" (
	"responsable_npi" text NOT NULL,
	"apprenant_id" text NOT NULL,
	"nature" text NOT NULL,
	"verifie" boolean NOT NULL,
	CONSTRAINT "liens_familiaux_responsable_npi_apprenant_id_pk" PRIMARY KEY("responsable_npi","apprenant_id")
);
--> statement-breakpoint
CREATE TABLE "workflow"."modeles" (
	"code" text PRIMARY KEY NOT NULL,
	"libelle" text NOT NULL,
	"etapes" jsonb NOT NULL,
	"version" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."parcours" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"type" text NOT NULL,
	"institution_id" text,
	"intitule" text NOT NULL,
	"statut" text NOT NULL,
	"valide_du" date DEFAULT current_date NOT NULL,
	"valide_au" date
);
--> statement-breakpoint
CREATE TABLE "registre_simule"."personnes" (
	"npi" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"prenoms" text NOT NULL,
	"date_naissance" date NOT NULL,
	"sexe" text NOT NULL,
	"commune_naissance_id" text NOT NULL,
	"parents_npi" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."profils" (
	"id" text PRIMARY KEY NOT NULL,
	"nom_affiche" text NOT NULL,
	"fonction" text NOT NULL,
	"npi" text,
	"habilitations" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."affectations" ADD CONSTRAINT "affectations_enseignant_id_enseignants_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."affectations" ADD CONSTRAINT "affectations_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."cellules" ADD CONSTRAINT "cellules_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "core"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD CONSTRAINT "certificats_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."classes" ADD CONSTRAINT "classes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."communes" ADD CONSTRAINT "communes_departement_id_departements_id_fk" FOREIGN KEY ("departement_id") REFERENCES "core"."departements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics"."communes_annee" ADD CONSTRAINT "communes_annee_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "core"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow"."decisions" ADD CONSTRAINT "decisions_demande_id_demandes_id_fk" FOREIGN KEY ("demande_id") REFERENCES "workflow"."demandes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow"."demandes" ADD CONSTRAINT "demandes_modele_modeles_code_fk" FOREIGN KEY ("modele") REFERENCES "workflow"."modeles"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enseignants" ADD CONSTRAINT "enseignants_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enseignements" ADD CONSTRAINT "enseignements_enseignant_id_enseignants_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."enseignements" ADD CONSTRAINT "enseignements_classe_id_classes_id_fk" FOREIGN KEY ("classe_id") REFERENCES "core"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."etablissements" ADD CONSTRAINT "etablissements_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "core"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."liens_familiaux" ADD CONSTRAINT "liens_familiaux_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."parcours" ADD CONSTRAINT "parcours_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."parcours" ADD CONSTRAINT "parcours_institution_id_etablissements_id_fk" FOREIGN KEY ("institution_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "affectations_enseignant_idx" ON "core"."affectations" USING btree ("enseignant_id");--> statement-breakpoint
CREATE INDEX "classes_etablissement_idx" ON "core"."classes" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "communes_departement_idx" ON "core"."communes" USING btree ("departement_id");--> statement-breakpoint
CREATE INDEX "demandes_statut_idx" ON "workflow"."demandes" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "etablissements_commune_idx" ON "core"."etablissements" USING btree ("commune_id");--> statement-breakpoint
CREATE INDEX "etablissements_position_idx" ON "core"."etablissements" USING gist ("position");--> statement-breakpoint
CREATE INDEX "evenements_apprenant_idx" ON "ledger"."evenements" USING btree ("apprenant_id","survenu_le");--> statement-breakpoint
CREATE INDEX "evenements_etablissement_idx" ON "ledger"."evenements" USING btree ("etablissement_id","survenu_le");--> statement-breakpoint
CREATE INDEX "evenements_type_idx" ON "ledger"."evenements" USING btree ("type");--> statement-breakpoint
CREATE INDEX "journal_horodatage_idx" ON "audit"."journal" USING btree ("horodatage");--> statement-breakpoint
CREATE INDEX "journal_profil_idx" ON "audit"."journal" USING btree ("profil_id");--> statement-breakpoint
CREATE INDEX "liens_apprenant_idx" ON "core"."liens_familiaux" USING btree ("apprenant_id");--> statement-breakpoint
CREATE INDEX "parcours_apprenant_idx" ON "core"."parcours" USING btree ("apprenant_id");