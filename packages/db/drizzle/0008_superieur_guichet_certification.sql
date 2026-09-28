CREATE TABLE "core"."allocations_etudiantes" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"etablissement_id" text,
	"annee_universitaire" text NOT NULL,
	"type_decision" text NOT NULL,
	"statut" text NOT NULL,
	"autorite" text NOT NULL,
	"reference_acte" text,
	"decide_le" date NOT NULL,
	"echeance_id" text,
	"motif" text
);
--> statement-breakpoint
CREATE TABLE "core"."concours_session" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"filiere_id" text NOT NULL,
	"session" text NOT NULL,
	"statut" text DEFAULT 'annonce' NOT NULL,
	"diplome_requis" text NOT NULL,
	"serie_requise" text[] DEFAULT '{}'::text[] NOT NULL,
	"places" integer,
	"epreuves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ouverture_le" date,
	"cloture_le" date,
	"epreuves_le" date
);
--> statement-breakpoint
CREATE TABLE "core"."cycles_epes" (
	"id" text PRIMARY KEY NOT NULL,
	"etablissement_id" text NOT NULL,
	"autorite" text NOT NULL,
	"phase" text NOT NULL,
	"statut" text DEFAULT 'instruit' NOT NULL,
	"avis_conseil" text DEFAULT 'non_demande' NOT NULL,
	"acte_reference" text,
	"accorde_le" date,
	"echeance_le" date,
	"renouvellements" integer DEFAULT 0 NOT NULL,
	"motif" text
);
--> statement-breakpoint
CREATE TABLE "core"."deliberations_diplome" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"jury_id" text NOT NULL,
	"etablissement_id" text NOT NULL,
	"filiere_id" text NOT NULL,
	"diplome" text NOT NULL,
	"decision" text NOT NULL,
	"credits_valides" integer DEFAULT 0 NOT NULL,
	"credits_requis" integer DEFAULT 0 NOT NULL,
	"moyenne_generale" double precision,
	"mention" text,
	"ue_manquantes" text[] DEFAULT '{}'::text[] NOT NULL,
	"delibere_le" date NOT NULL,
	"certificat_id" text
);
--> statement-breakpoint
CREATE TABLE "core"."demandes_acte" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"etablissement_id" text,
	"type_acte" text NOT NULL,
	"autorite" text NOT NULL,
	"annee_universitaire" text,
	"periode_id" text,
	"statut" text DEFAULT 'demandee' NOT NULL,
	"delai_contractuel_jours" integer NOT NULL,
	"delai_source" text NOT NULL,
	"motif_demande" text,
	"motif_refus" text,
	"demandee_le" date NOT NULL,
	"disponible_le" date,
	"remis_le" date,
	"mode_retrait" text,
	"piece_presentee" text,
	"remis_a" text,
	"reference_quittance" text,
	"empreinte" text
);
--> statement-breakpoint
CREATE TABLE "core"."echeances_depot" (
	"id" text PRIMARY KEY NOT NULL,
	"annee_universitaire" text NOT NULL,
	"type_decision" text NOT NULL,
	"date_limite" date NOT NULL,
	"actes_exiges" text[] DEFAULT '{}'::text[] NOT NULL,
	"autorite" text NOT NULL,
	"intitule" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."equivalences" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"etablissement_id" text NOT NULL,
	"ue_id" text NOT NULL,
	"titre_origine" text NOT NULL,
	"etablissement_origine" text,
	"annee_origine" text,
	"credits_reconnus" integer DEFAULT 0 NOT NULL,
	"statut" text DEFAULT 'demandee' NOT NULL,
	"autorite" text DEFAULT 'etablissement' NOT NULL,
	"motif" text NOT NULL,
	"decide_par" text,
	"decide_le" date
);
--> statement-breakpoint
CREATE TABLE "core"."filiere_superieure" (
	"id" text PRIMARY KEY NOT NULL,
	"etablissement_id" text NOT NULL,
	"nom" text NOT NULL,
	"domaine" text NOT NULL,
	"voie" text NOT NULL,
	"cycle" text,
	"diplome_vise" text NOT NULL,
	"composantes" text[] DEFAULT '{}'::text[] NOT NULL,
	"credits_ects" integer DEFAULT 0 NOT NULL,
	"capacite_annuelle" integer,
	"capacite_par_composante" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"serie_bac_requise" text[] DEFAULT '{}'::text[] NOT NULL,
	"acces_concours" boolean DEFAULT false NOT NULL,
	"stage_obligatoire_mois" integer DEFAULT 0 NOT NULL,
	"criteres_orientation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valide_du" date DEFAULT current_date NOT NULL,
	"valide_au" date
);
--> statement-breakpoint
CREATE TABLE "core"."groupes" (
	"id" text PRIMARY KEY NOT NULL,
	"offre_ue_id" text NOT NULL,
	"type" text NOT NULL,
	"intitule" text NOT NULL,
	"capacite" integer NOT NULL,
	"enseignant_id" text,
	"creneau" text
);
--> statement-breakpoint
CREATE TABLE "core"."homologations_filiere" (
	"id" text PRIMARY KEY NOT NULL,
	"etablissement_id" text NOT NULL,
	"filiere_id" text NOT NULL,
	"diplome" text NOT NULL,
	"statut" text DEFAULT 'instruite' NOT NULL,
	"quota_annuel" integer,
	"accordee_le" date,
	"echeance_le" date,
	"dernier_controle_le" date,
	"conclusion_controle" text DEFAULT 'non_controle' NOT NULL,
	"motif" text
);
--> statement-breakpoint
CREATE TABLE "core"."inscriptions_superieures" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"etablissement_id" text NOT NULL,
	"filiere_id" text NOT NULL,
	"composante" text,
	"annee_universitaire" text NOT NULL,
	"regime_pedagogique" text NOT NULL,
	"numero_etudiant" text,
	"statut" text NOT NULL,
	"statut_compte" text DEFAULT 'non_precise' NOT NULL,
	"ue_non_acquises" text[] DEFAULT '{}'::text[] NOT NULL,
	"credits_acquis_cumules" integer DEFAULT 0 NOT NULL,
	"inscrite_le" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."inscriptions_ue" (
	"id" text PRIMARY KEY NOT NULL,
	"inscription_superieure_id" text NOT NULL,
	"apprenant_id" text NOT NULL,
	"offre_ue_id" text NOT NULL,
	"groupe_id" text,
	"statut" text DEFAULT 'proposee' NOT NULL,
	"signee_le" date,
	"motif_refus" text
);
--> statement-breakpoint
CREATE TABLE "core"."jurys" (
	"id" text PRIMARY KEY NOT NULL,
	"autorite" text NOT NULL,
	"office" text,
	"session_examen_id" text,
	"filiere_id" text,
	"periode_id" text,
	"diplome" text NOT NULL,
	"president" text NOT NULL,
	"membres" text[] DEFAULT '{}'::text[] NOT NULL,
	"quorum" integer NOT NULL,
	"statut" text DEFAULT 'constitue' NOT NULL,
	"reuni_le" date,
	"pv_reference" text
);
--> statement-breakpoint
CREATE TABLE "core"."notes_ue" (
	"evenement_id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"offre_ue_id" text NOT NULL,
	"ue_id" text NOT NULL,
	"session" text NOT NULL,
	"note" double precision NOT NULL,
	"credits_ects" integer NOT NULL,
	"coefficient" double precision NOT NULL,
	"survenu_le" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."offres_ue" (
	"id" text PRIMARY KEY NOT NULL,
	"ue_id" text NOT NULL,
	"periode_id" text NOT NULL,
	"etablissement_id" text NOT NULL,
	"enseignant_id" text,
	"session" text DEFAULT 'normale' NOT NULL,
	"volume_cm" integer DEFAULT 0 NOT NULL,
	"volume_td" integer DEFAULT 0 NOT NULL,
	"volume_tp" integer DEFAULT 0 NOT NULL,
	"capacite" integer
);
--> statement-breakpoint
CREATE TABLE "core"."periodes" (
	"id" text PRIMARY KEY NOT NULL,
	"filiere_id" text NOT NULL,
	"composante" text,
	"type" text NOT NULL,
	"numero" integer NOT NULL,
	"intitule" text NOT NULL,
	"annee_universitaire" text NOT NULL,
	"debut" date,
	"fin" date,
	"credits_attendus" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "periodes_filiere_annee_composante_type_numero_uq" UNIQUE NULLS NOT DISTINCT("filiere_id","annee_universitaire","composante","type","numero")
);
--> statement-breakpoint
CREATE TABLE "core"."regles_validation" (
	"id" text PRIMARY KEY NOT NULL,
	"portee" text NOT NULL,
	"etablissement_id" text,
	"filiere_id" text,
	"periode_id" text,
	"regime" text,
	"seuil_acquisition" double precision DEFAULT 10 NOT NULL,
	"note_eliminatoire" double precision,
	"compensation" text DEFAULT 'par_bloc' NOT NULL,
	"ponderation" text DEFAULT 'ects' NOT NULL,
	"session_retenue" text DEFAULT 'meilleure' NOT NULL,
	"seuil_moyenne_periode" double precision,
	"duree_validite_acquis" integer DEFAULT 5 NOT NULL,
	"report_credits_inter_etab" boolean DEFAULT true NOT NULL,
	"blocs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "regles_validation_perimetre_uq" UNIQUE NULLS NOT DISTINCT("portee","etablissement_id","filiere_id","periode_id","regime")
);
--> statement-breakpoint
CREATE TABLE "core"."stage" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"etablissement_id" text,
	"filiere_id" text,
	"entreprise" text NOT NULL,
	"tuteur_pro" text,
	"tuteur_academique_id" text,
	"du" date,
	"au" date,
	"statut" text DEFAULT 'recherche' NOT NULL,
	"valide_par_etablissement" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."unites_enseignement" (
	"id" text PRIMARY KEY NOT NULL,
	"filiere_id" text NOT NULL,
	"code" text NOT NULL,
	"intitule" text NOT NULL,
	"type" text NOT NULL,
	"credits_ects" integer NOT NULL,
	"coefficient" double precision DEFAULT 1 NOT NULL,
	"periode_type" text,
	"periode_numero" integer,
	"prerequis" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."validations_ue" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"ue_id" text NOT NULL,
	"offre_ue_id" text,
	"periode_id" text,
	"etablissement_id" text NOT NULL,
	"voie" text NOT NULL,
	"credits_acquis" integer NOT NULL,
	"moyenne" double precision,
	"session" text DEFAULT 'hors_session' NOT NULL,
	"regle_validation_id" text NOT NULL,
	"justification" text NOT NULL,
	"acquise_le" date NOT NULL,
	"definitive" boolean DEFAULT true NOT NULL,
	"evenement_id" text,
	CONSTRAINT "validations_ue_apprenant_ue_periode_uq" UNIQUE NULLS NOT DISTINCT("apprenant_id","ue_id","periode_id")
);
--> statement-breakpoint
CREATE TABLE "core"."voeu_superieur" (
	"id" text PRIMARY KEY NOT NULL,
	"apprenant_id" text NOT NULL,
	"filiere_id" text NOT NULL,
	"concours_id" text,
	"rang" integer NOT NULL,
	"statut" text DEFAULT 'brouillon' NOT NULL,
	"annee_scolaire" text NOT NULL,
	"decide_par" text,
	"decide_le" date
);
--> statement-breakpoint
ALTER TABLE "core"."certificats" ALTER COLUMN "mention" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."certificats" ALTER COLUMN "moyenne" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD COLUMN "filiere_id" text;--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD COLUMN "etablissement_id" text;--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD COLUMN "office" text;--> statement-breakpoint
ALTER TABLE "core"."etablissements" ADD COLUMN "sigle" text;--> statement-breakpoint
ALTER TABLE "core"."etablissements" ADD COLUMN "tutelles" text[];--> statement-breakpoint
ALTER TABLE "core"."etablissements" ADD COLUMN "rattachement_id" text;--> statement-breakpoint
ALTER TABLE "core"."allocations_etudiantes" ADD CONSTRAINT "allocations_etudiantes_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."allocations_etudiantes" ADD CONSTRAINT "allocations_etudiantes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."allocations_etudiantes" ADD CONSTRAINT "allocations_etudiantes_echeance_id_echeances_depot_id_fk" FOREIGN KEY ("echeance_id") REFERENCES "core"."echeances_depot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."concours_session" ADD CONSTRAINT "concours_session_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."cycles_epes" ADD CONSTRAINT "cycles_epes_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."deliberations_diplome" ADD CONSTRAINT "deliberations_diplome_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."deliberations_diplome" ADD CONSTRAINT "deliberations_diplome_jury_id_jurys_id_fk" FOREIGN KEY ("jury_id") REFERENCES "core"."jurys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."deliberations_diplome" ADD CONSTRAINT "deliberations_diplome_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."deliberations_diplome" ADD CONSTRAINT "deliberations_diplome_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."deliberations_diplome" ADD CONSTRAINT "deliberations_diplome_certificat_id_certificats_id_fk" FOREIGN KEY ("certificat_id") REFERENCES "core"."certificats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."demandes_acte" ADD CONSTRAINT "demandes_acte_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."demandes_acte" ADD CONSTRAINT "demandes_acte_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."demandes_acte" ADD CONSTRAINT "demandes_acte_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "core"."periodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."equivalences" ADD CONSTRAINT "equivalences_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."equivalences" ADD CONSTRAINT "equivalences_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."equivalences" ADD CONSTRAINT "equivalences_ue_id_unites_enseignement_id_fk" FOREIGN KEY ("ue_id") REFERENCES "core"."unites_enseignement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."filiere_superieure" ADD CONSTRAINT "filiere_superieure_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."groupes" ADD CONSTRAINT "groupes_offre_ue_id_offres_ue_id_fk" FOREIGN KEY ("offre_ue_id") REFERENCES "core"."offres_ue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."groupes" ADD CONSTRAINT "groupes_enseignant_id_enseignants_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."homologations_filiere" ADD CONSTRAINT "homologations_filiere_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."homologations_filiere" ADD CONSTRAINT "homologations_filiere_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_superieures" ADD CONSTRAINT "inscriptions_superieures_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_superieures" ADD CONSTRAINT "inscriptions_superieures_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_superieures" ADD CONSTRAINT "inscriptions_superieures_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_ue" ADD CONSTRAINT "inscriptions_ue_inscription_superieure_id_inscriptions_superieures_id_fk" FOREIGN KEY ("inscription_superieure_id") REFERENCES "core"."inscriptions_superieures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_ue" ADD CONSTRAINT "inscriptions_ue_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_ue" ADD CONSTRAINT "inscriptions_ue_offre_ue_id_offres_ue_id_fk" FOREIGN KEY ("offre_ue_id") REFERENCES "core"."offres_ue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."inscriptions_ue" ADD CONSTRAINT "inscriptions_ue_groupe_id_groupes_id_fk" FOREIGN KEY ("groupe_id") REFERENCES "core"."groupes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jurys" ADD CONSTRAINT "jurys_session_examen_id_examens_sessions_id_fk" FOREIGN KEY ("session_examen_id") REFERENCES "core"."examens_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jurys" ADD CONSTRAINT "jurys_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."jurys" ADD CONSTRAINT "jurys_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "core"."periodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notes_ue" ADD CONSTRAINT "notes_ue_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notes_ue" ADD CONSTRAINT "notes_ue_offre_ue_id_offres_ue_id_fk" FOREIGN KEY ("offre_ue_id") REFERENCES "core"."offres_ue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notes_ue" ADD CONSTRAINT "notes_ue_ue_id_unites_enseignement_id_fk" FOREIGN KEY ("ue_id") REFERENCES "core"."unites_enseignement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."offres_ue" ADD CONSTRAINT "offres_ue_ue_id_unites_enseignement_id_fk" FOREIGN KEY ("ue_id") REFERENCES "core"."unites_enseignement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."offres_ue" ADD CONSTRAINT "offres_ue_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "core"."periodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."offres_ue" ADD CONSTRAINT "offres_ue_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."offres_ue" ADD CONSTRAINT "offres_ue_enseignant_id_enseignants_id_fk" FOREIGN KEY ("enseignant_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."periodes" ADD CONSTRAINT "periodes_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."regles_validation" ADD CONSTRAINT "regles_validation_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."regles_validation" ADD CONSTRAINT "regles_validation_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."regles_validation" ADD CONSTRAINT "regles_validation_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "core"."periodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."stage" ADD CONSTRAINT "stage_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."stage" ADD CONSTRAINT "stage_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."stage" ADD CONSTRAINT "stage_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."stage" ADD CONSTRAINT "stage_tuteur_academique_id_enseignants_id_fk" FOREIGN KEY ("tuteur_academique_id") REFERENCES "core"."enseignants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."unites_enseignement" ADD CONSTRAINT "unites_enseignement_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_ue_id_unites_enseignement_id_fk" FOREIGN KEY ("ue_id") REFERENCES "core"."unites_enseignement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_offre_ue_id_offres_ue_id_fk" FOREIGN KEY ("offre_ue_id") REFERENCES "core"."offres_ue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_periode_id_periodes_id_fk" FOREIGN KEY ("periode_id") REFERENCES "core"."periodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."validations_ue" ADD CONSTRAINT "validations_ue_regle_validation_id_regles_validation_id_fk" FOREIGN KEY ("regle_validation_id") REFERENCES "core"."regles_validation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."voeu_superieur" ADD CONSTRAINT "voeu_superieur_apprenant_id_apprenants_id_fk" FOREIGN KEY ("apprenant_id") REFERENCES "core"."apprenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."voeu_superieur" ADD CONSTRAINT "voeu_superieur_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."voeu_superieur" ADD CONSTRAINT "voeu_superieur_concours_id_concours_session_id_fk" FOREIGN KEY ("concours_id") REFERENCES "core"."concours_session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocations_etudiantes_apprenant_annee_type_uq" ON "core"."allocations_etudiantes" USING btree ("apprenant_id","annee_universitaire","type_decision");--> statement-breakpoint
CREATE INDEX "allocations_etudiantes_annee_idx" ON "core"."allocations_etudiantes" USING btree ("annee_universitaire","statut");--> statement-breakpoint
CREATE INDEX "allocations_etudiantes_apprenant_idx" ON "core"."allocations_etudiantes" USING btree ("apprenant_id","decide_le");--> statement-breakpoint
CREATE UNIQUE INDEX "concours_session_filiere_session_uq" ON "core"."concours_session" USING btree ("filiere_id","session");--> statement-breakpoint
CREATE INDEX "concours_session_statut_idx" ON "core"."concours_session" USING btree ("statut");--> statement-breakpoint
CREATE UNIQUE INDEX "cycles_epes_etablissement_autorite_uq" ON "core"."cycles_epes" USING btree ("etablissement_id","autorite");--> statement-breakpoint
CREATE INDEX "cycles_epes_echeance_idx" ON "core"."cycles_epes" USING btree ("echeance_le","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "deliberations_diplome_apprenant_jury_uq" ON "core"."deliberations_diplome" USING btree ("apprenant_id","jury_id");--> statement-breakpoint
CREATE INDEX "deliberations_diplome_apprenant_idx" ON "core"."deliberations_diplome" USING btree ("apprenant_id","delibere_le");--> statement-breakpoint
CREATE INDEX "deliberations_diplome_decision_idx" ON "core"."deliberations_diplome" USING btree ("decision","delibere_le");--> statement-breakpoint
CREATE INDEX "deliberations_diplome_etablissement_idx" ON "core"."deliberations_diplome" USING btree ("etablissement_id","delibere_le");--> statement-breakpoint
CREATE INDEX "demandes_acte_apprenant_idx" ON "core"."demandes_acte" USING btree ("apprenant_id","statut");--> statement-breakpoint
CREATE INDEX "demandes_acte_guichet_idx" ON "core"."demandes_acte" USING btree ("etablissement_id","type_acte","statut");--> statement-breakpoint
CREATE INDEX "demandes_acte_annee_idx" ON "core"."demandes_acte" USING btree ("annee_universitaire","type_acte");--> statement-breakpoint
CREATE UNIQUE INDEX "demandes_acte_ouverte_uq" ON "core"."demandes_acte" USING btree ("apprenant_id","type_acte","annee_universitaire") WHERE "core"."demandes_acte"."statut" in ('demandee', 'en_instruction', 'disponible');--> statement-breakpoint
CREATE UNIQUE INDEX "echeances_depot_annee_type_uq" ON "core"."echeances_depot" USING btree ("annee_universitaire","type_decision");--> statement-breakpoint
CREATE INDEX "echeances_depot_date_idx" ON "core"."echeances_depot" USING btree ("date_limite");--> statement-breakpoint
CREATE INDEX "equivalences_apprenant_idx" ON "core"."equivalences" USING btree ("apprenant_id","statut");--> statement-breakpoint
CREATE INDEX "equivalences_statut_idx" ON "core"."equivalences" USING btree ("statut","autorite");--> statement-breakpoint
CREATE INDEX "equivalences_etablissement_idx" ON "core"."equivalences" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "filiere_superieure_etablissement_idx" ON "core"."filiere_superieure" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "filiere_superieure_domaine_idx" ON "core"."filiere_superieure" USING btree ("domaine");--> statement-breakpoint
CREATE UNIQUE INDEX "groupes_offre_type_intitule_uq" ON "core"."groupes" USING btree ("offre_ue_id","type","intitule");--> statement-breakpoint
CREATE INDEX "groupes_offre_idx" ON "core"."groupes" USING btree ("offre_ue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "homologations_filiere_etablissement_filiere_uq" ON "core"."homologations_filiere" USING btree ("etablissement_id","filiere_id");--> statement-breakpoint
CREATE INDEX "homologations_filiere_echeance_idx" ON "core"."homologations_filiere" USING btree ("echeance_le","statut");--> statement-breakpoint
CREATE UNIQUE INDEX "inscriptions_superieures_parcours_uq" ON "core"."inscriptions_superieures" USING btree ("apprenant_id","etablissement_id","filiere_id","annee_universitaire");--> statement-breakpoint
CREATE INDEX "inscriptions_superieures_apprenant_idx" ON "core"."inscriptions_superieures" USING btree ("apprenant_id","annee_universitaire");--> statement-breakpoint
CREATE INDEX "inscriptions_superieures_etablissement_idx" ON "core"."inscriptions_superieures" USING btree ("etablissement_id","statut");--> statement-breakpoint
CREATE INDEX "inscriptions_superieures_filiere_idx" ON "core"."inscriptions_superieures" USING btree ("filiere_id","annee_universitaire");--> statement-breakpoint
CREATE UNIQUE INDEX "inscriptions_ue_inscription_offre_uq" ON "core"."inscriptions_ue" USING btree ("inscription_superieure_id","offre_ue_id");--> statement-breakpoint
CREATE INDEX "inscriptions_ue_apprenant_idx" ON "core"."inscriptions_ue" USING btree ("apprenant_id","statut");--> statement-breakpoint
CREATE INDEX "inscriptions_ue_offre_idx" ON "core"."inscriptions_ue" USING btree ("offre_ue_id");--> statement-breakpoint
CREATE INDEX "jurys_diplome_statut_idx" ON "core"."jurys" USING btree ("diplome","statut");--> statement-breakpoint
CREATE INDEX "jurys_periode_idx" ON "core"."jurys" USING btree ("periode_id");--> statement-breakpoint
CREATE INDEX "jurys_filiere_idx" ON "core"."jurys" USING btree ("filiere_id");--> statement-breakpoint
CREATE INDEX "notes_ue_apprenant_idx" ON "core"."notes_ue" USING btree ("apprenant_id","ue_id","survenu_le");--> statement-breakpoint
CREATE INDEX "notes_ue_offre_idx" ON "core"."notes_ue" USING btree ("offre_ue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offres_ue_ue_periode_session_uq" ON "core"."offres_ue" USING btree ("ue_id","periode_id","session");--> statement-breakpoint
CREATE INDEX "offres_ue_periode_idx" ON "core"."offres_ue" USING btree ("periode_id");--> statement-breakpoint
CREATE INDEX "offres_ue_etablissement_idx" ON "core"."offres_ue" USING btree ("etablissement_id");--> statement-breakpoint
CREATE INDEX "periodes_annee_idx" ON "core"."periodes" USING btree ("annee_universitaire");--> statement-breakpoint
CREATE INDEX "regles_validation_portee_idx" ON "core"."regles_validation" USING btree ("portee","etablissement_id","filiere_id","periode_id");--> statement-breakpoint
CREATE INDEX "stage_apprenant_idx" ON "core"."stage" USING btree ("apprenant_id");--> statement-breakpoint
CREATE INDEX "stage_statut_idx" ON "core"."stage" USING btree ("statut");--> statement-breakpoint
CREATE INDEX "stage_filiere_idx" ON "core"."stage" USING btree ("filiere_id");--> statement-breakpoint
CREATE INDEX "stage_etablissement_idx" ON "core"."stage" USING btree ("etablissement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unites_enseignement_filiere_code_uq" ON "core"."unites_enseignement" USING btree ("filiere_id","code");--> statement-breakpoint
CREATE INDEX "unites_enseignement_filiere_idx" ON "core"."unites_enseignement" USING btree ("filiere_id");--> statement-breakpoint
CREATE INDEX "validations_ue_apprenant_idx" ON "core"."validations_ue" USING btree ("apprenant_id","ue_id");--> statement-breakpoint
CREATE INDEX "validations_ue_etablissement_idx" ON "core"."validations_ue" USING btree ("etablissement_id","acquise_le");--> statement-breakpoint
CREATE INDEX "validations_ue_periode_idx" ON "core"."validations_ue" USING btree ("periode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voeu_superieur_apprenant_filiere_annee_uq" ON "core"."voeu_superieur" USING btree ("apprenant_id","filiere_id","annee_scolaire");--> statement-breakpoint
CREATE INDEX "voeu_superieur_apprenant_idx" ON "core"."voeu_superieur" USING btree ("apprenant_id","annee_scolaire");--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD CONSTRAINT "certificats_filiere_id_filiere_superieure_id_fk" FOREIGN KEY ("filiere_id") REFERENCES "core"."filiere_superieure"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."certificats" ADD CONSTRAINT "certificats_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."etablissements" ADD CONSTRAINT "etablissements_rattachement_id_etablissements_id_fk" FOREIGN KEY ("rattachement_id") REFERENCES "core"."etablissements"("id") ON DELETE no action ON UPDATE no action;