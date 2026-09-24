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
