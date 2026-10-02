-- Durcissement appliqué après chaque migration (idempotent).
-- Le registre d'événements, le journal d'audit et les décisions de workflow sont en AJOUT SEUL :
-- une correction est un nouvel enregistrement, jamais une modification ni une suppression.

CREATE OR REPLACE FUNCTION public.beile_interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table en ajout seul (%.%) : % interdit — enregistrer un événement correctif',
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS ajout_seul ON ledger.evenements;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON ledger.evenements
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();

DROP TRIGGER IF EXISTS ajout_seul_troncature ON ledger.evenements;
CREATE TRIGGER ajout_seul_troncature BEFORE TRUNCATE ON ledger.evenements
  FOR EACH STATEMENT EXECUTE FUNCTION public.beile_interdire_modification();

DROP TRIGGER IF EXISTS ajout_seul ON audit.journal;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON audit.journal
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();

DROP TRIGGER IF EXISTS ajout_seul_troncature ON audit.journal;
CREATE TRIGGER ajout_seul_troncature BEFORE TRUNCATE ON audit.journal
  FOR EACH STATEMENT EXECUTE FUNCTION public.beile_interdire_modification();

DROP TRIGGER IF EXISTS ajout_seul ON workflow.decisions;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON workflow.decisions
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();

-- Le compartiment sensible n'est jamais lisible par défaut : RLS activée sans politique = aucun accès
-- pour les rôles applicatifs ordinaires. Les politiques de besoin d'en connaître seront ajoutées avec
-- l'authentification (rôle de base « beile_app » distinct du propriétaire du schéma).
ALTER TABLE sensible.cas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensible.cas FORCE ROW LEVEL SECURITY;

-- Rôle applicatif aux droits minimaux. Le propriétaire fourni par l'hébergeur (neondb_owner) possède
-- BYPASSRLS : il ne doit servir qu'aux migrations. L'API se connecte avec un rôle membre de beile_app.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beile_app') THEN
    CREATE ROLE beile_app NOLOGIN NOBYPASSRLS;
  END IF;
  -- Le propriétaire peut endosser le rôle (tests, maintenance) sans hériter de ses droits.
  EXECUTE format('GRANT beile_app TO %I WITH INHERIT FALSE, SET TRUE', current_user);
END $$;

GRANT USAGE ON SCHEMA core, ledger, audit, analytics, workflow, sensible, gouvernance, registre_simule TO beile_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA core TO beile_app;
-- Référentiel réel des établissements : chargé par le propriétaire (npm run referentiel), lecture seule pour l'application.
REVOKE INSERT, UPDATE ON core.referentiel_etablissements FROM beile_app;
-- Arbre des organisations : dérivé du territoire par le script « organisations », lecture seule pour l'application.
REVOKE INSERT, UPDATE ON core.organisations FROM beile_app;
-- Clés FIDO2 : une clé retirée par son titulaire est supprimée (seule la clé publique y figure).
GRANT DELETE ON core.cles_fido TO beile_app;
GRANT SELECT, INSERT, UPDATE ON workflow.modeles, workflow.demandes TO beile_app;
-- Tables en ajout seul : lecture et insertion uniquement (seconde barrière, en plus des déclencheurs).
GRANT SELECT, INSERT ON ledger.evenements, audit.journal, workflow.decisions TO beile_app;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics, gouvernance, registre_simule TO beile_app;
-- Compartiment sensible : RLS forcée et aucune politique = aucune ligne accessible tant que les
-- politiques de besoin d'en connaître ne sont pas définies.
GRANT SELECT, INSERT ON sensible.cas TO beile_app;

-- Comptes et sessions : l'API gère ses sessions et notifications ; aucune suppression physique des comptes.
GRANT SELECT, INSERT, UPDATE ON core.comptes, core.sessions, core.notifications TO beile_app;
GRANT DELETE ON core.sessions TO beile_app;

-- Projection de lecture : l'API la tient à jour avec le registre.
GRANT SELECT, INSERT, UPDATE ON core.scolarites TO beile_app;
-- Index d'accès aux absences par date déclarée (appel du jour, à l'échelle nationale).
CREATE INDEX IF NOT EXISTS evenements_absences_date_idx ON ledger.evenements ((donnees->>'date'), etablissement_id) WHERE type = 'ABSENCE';

-- Projection des notes effectives (CQRS) : lecture, ajout, correction par l'API.
GRANT SELECT, INSERT, UPDATE ON core.notes TO beile_app;

-- Idempotence des saisies (file hors connexion) : rejouer une saisie déjà reçue ne crée jamais de doublon.
CREATE UNIQUE INDEX IF NOT EXISTS evenements_id_saisie_idx ON ledger.evenements ((donnees->>'idSaisie'), type, apprenant_id)
  WHERE donnees ? 'idSaisie';

-- Assistance : demandes et fil de messages. Aucune suppression (une demande se clôt, elle ne disparaît pas).
-- Les messages sont en AJOUT SEUL : une réponse envoyée ne se modifie pas (traçabilité du support).
GRANT SELECT, INSERT, UPDATE ON core.tickets TO beile_app;
GRANT SELECT, INSERT ON core.tickets_messages TO beile_app;
REVOKE UPDATE, DELETE, TRUNCATE ON core.tickets_messages FROM beile_app;
REVOKE DELETE, TRUNCATE ON core.tickets FROM beile_app;
DROP TRIGGER IF EXISTS ajout_seul ON core.tickets_messages;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON core.tickets_messages
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();
-- Seconde barrière aux valeurs (en plus de la validation zod de l'API).
ALTER TABLE core.tickets DROP CONSTRAINT IF EXISTS tickets_valeurs_chk;
ALTER TABLE core.tickets ADD CONSTRAINT tickets_valeurs_chk CHECK (
  categorie IN ('connexion', 'donnees', 'acces', 'bug', 'autre')
  AND priorite IN ('basse', 'normale', 'haute', 'critique')
  AND statut IN ('ouvert', 'en_cours', 'resolu', 'clos')
  AND char_length(sujet) BETWEEN 5 AND 140
  AND char_length(description) BETWEEN 10 AND 4000
);
ALTER TABLE core.tickets_messages DROP CONSTRAINT IF EXISTS tickets_messages_contenu_chk;
ALTER TABLE core.tickets_messages ADD CONSTRAINT tickets_messages_contenu_chk CHECK (char_length(contenu) BETWEEN 1 AND 4000);

-- Calendrier scolaire : donnée de configuration gérée par l'administration (suppression permise, journalisée).
GRANT SELECT, INSERT, UPDATE, DELETE ON core.calendrier TO beile_app;
ALTER TABLE core.calendrier DROP CONSTRAINT IF EXISTS calendrier_dates_coherentes;
ALTER TABLE core.calendrier ADD CONSTRAINT calendrier_dates_coherentes CHECK (fin >= debut);

-- Certification et scolarité du supérieur : ce qui a été acquis, délibéré ou certifié ne se réécrit pas.
-- Notes d'UE, acquis et délibérations : ajout seul (une correction est un nouveau fait du registre).
DROP TRIGGER IF EXISTS ajout_seul ON core.notes_ue;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON core.notes_ue
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();
DROP TRIGGER IF EXISTS ajout_seul ON core.validations_ue;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON core.validations_ue
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();
DROP TRIGGER IF EXISTS ajout_seul ON core.deliberations_diplome;
CREATE TRIGGER ajout_seul BEFORE UPDATE OR DELETE ON core.deliberations_diplome
  FOR EACH ROW EXECUTE FUNCTION public.beile_interdire_modification();

-- Diplômes : aucun champ signé ne bouge après l'émission, et une révocation est définitive. Sans cette
-- barrière, un UPDATE de la colonne `revoque` (qui n'entre pas dans le sceau) réhabiliterait en silence
-- un diplôme retiré. La seule transition admise est revoque false → true.
CREATE OR REPLACE FUNCTION public.beile_certificat_immuable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Diplôme %: suppression interdite — révoquer par un fait du registre', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoque AND NOT NEW.revoque THEN
    RAISE EXCEPTION 'Diplôme %: une révocation est définitive', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.apprenant_id, NEW.examen, NEW.session, NEW.mention, NEW.moyenne, NEW.delivre_le, NEW.empreinte, NEW.filiere_id, NEW.etablissement_id, NEW.office)
     IS DISTINCT FROM (OLD.id, OLD.apprenant_id, OLD.examen, OLD.session, OLD.mention, OLD.moyenne, OLD.delivre_le, OLD.empreinte, OLD.filiere_id, OLD.etablissement_id, OLD.office) THEN
    RAISE EXCEPTION 'Diplôme %: un champ signé ne se modifie pas après émission', OLD.id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS certificat_immuable ON core.certificats;
CREATE TRIGGER certificat_immuable BEFORE UPDATE OR DELETE ON core.certificats
  FOR EACH ROW EXECUTE FUNCTION public.beile_certificat_immuable();

-- Limite de débit partagée entre instances (compteurs par fenêtre ; purge des fenêtres échues).
GRANT SELECT, INSERT, UPDATE, DELETE ON core.compteurs_debit TO beile_app;

-- Un justificatif d'absence se tranche UNE fois (validé ou refusé) : même sous décisions groupées ou
-- double clic, la seconde décision est refusée par la base, pas seulement par l'API.
CREATE UNIQUE INDEX IF NOT EXISTS evenements_decision_justification_uq ON ledger.evenements ((donnees->>'justificationId'))
  WHERE type = 'DECISION_JUSTIFICATION';

-- ------------------------------------------------------------------ Portail public (lot D)
-- Rôle du déploiement « portail public » : lecture des seules données publiques, aucune donnée nominative.
-- Même compromis (injection, fuite de la chaîne de connexion), ce portail ne lit ni élève, ni note, ni compte.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beile_portail_public') THEN
    CREATE ROLE beile_portail_public NOLOGIN NOBYPASSRLS;
  END IF;
  EXECUTE format('GRANT beile_portail_public TO %I WITH INHERIT FALSE, SET TRUE', current_user);
END $$;
GRANT USAGE ON SCHEMA core, analytics TO beile_portail_public;
GRANT SELECT ON core.referentiel_etablissements, core.communes, core.departements, core.calendrier, core.etablissements,
  core.filiere_superieure, core.homologations_filiere, core.concours_session TO beile_portail_public;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO beile_portail_public;
-- Vérification publique des diplômes, des actes et des résultats d'examens : tables sans donnée nominative,
-- et des élèves seulement prénoms, nom et date de naissance (jamais NPI, adresse, note, absence ni famille).
GRANT SELECT ON core.certificats, core.examens_sessions, core.examens_centres, core.examens_candidatures TO beile_portail_public;
GRANT SELECT (id, prenoms, nom, date_naissance) ON core.apprenants TO beile_portail_public;
GRANT SELECT (id, apprenant_id, type_acte, annee_universitaire, periode_id, disponible_le, statut, empreinte, autorite) ON core.demandes_acte TO beile_portail_public;
-- Chaque consultation publique est tracée (ajout seul).
GRANT USAGE ON SCHEMA audit TO beile_portail_public;
GRANT INSERT ON audit.journal TO beile_portail_public;
-- Plafond de débit partagé entre instances (vérifications publiques).
GRANT SELECT, INSERT, UPDATE ON core.compteurs_debit TO beile_portail_public;
REVOKE DELETE ON core.compteurs_debit FROM beile_portail_public;

-- ------------------------------------------------------------------ Audit d'octobre 2026
-- Liens enseignant–classe : supprimés à la mutation d'un enseignant (fin des droits dans l'ancien établissement).
GRANT DELETE ON core.enseignements TO beile_app;
-- Défis WebAuthn : consommés (supprimés) à l'usage, purgés à l'échéance.
GRANT DELETE ON core.defis_webauthn TO beile_app;

-- Résultats d'examens nationaux : une fois la session publiée, ni verdict, ni moyenne, ni mention ne
-- changent EN BASE (pas seulement dans l'API) ; une session publiée ne redevient jamais brouillon.
CREATE OR REPLACE FUNCTION public.beile_resultat_publie_immuable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'examens_sessions' THEN
    IF OLD.statut = 'publiee' AND (TG_OP = 'DELETE' OR NEW.statut IS DISTINCT FROM 'publiee') THEN
      RAISE EXCEPTION 'Session d''examen publiée : son statut ne change plus';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM core.examens_sessions s WHERE s.id = OLD.session_id AND s.statut = 'publiee') THEN
    IF TG_OP = 'DELETE' OR NEW.decision IS DISTINCT FROM OLD.decision OR NEW.moyenne IS DISTINCT FROM OLD.moyenne
       OR NEW.mention IS DISTINCT FROM OLD.mention OR NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.apprenant_id IS DISTINCT FROM OLD.apprenant_id THEN
      RAISE EXCEPTION 'Résultat d''une session publiée : non modifiable';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS resultat_publie_immuable ON core.examens_sessions;
CREATE TRIGGER resultat_publie_immuable BEFORE UPDATE OR DELETE ON core.examens_sessions
  FOR EACH ROW EXECUTE FUNCTION public.beile_resultat_publie_immuable();
DROP TRIGGER IF EXISTS resultat_publie_immuable ON core.examens_candidatures;
CREATE TRIGGER resultat_publie_immuable BEFORE UPDATE OR DELETE ON core.examens_candidatures
  FOR EACH ROW EXECUTE FUNCTION public.beile_resultat_publie_immuable();

-- Tables en ajout seul : la troncature est interdite aussi (seconde barrière, propriétaire compris).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['workflow.decisions', 'core.tickets_messages', 'core.notes_ue', 'core.validations_ue', 'core.deliberations_diplome'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ajout_seul_troncature ON %s', t);
    EXECUTE format('CREATE TRIGGER ajout_seul_troncature BEFORE TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION public.beile_interdire_modification()', t);
  END LOOP;
END $$;
