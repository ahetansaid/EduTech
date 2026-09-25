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
