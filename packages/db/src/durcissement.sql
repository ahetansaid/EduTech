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
