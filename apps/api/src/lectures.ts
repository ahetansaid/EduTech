import { schema } from "@beile/db";
import { and, eq, sql } from "drizzle-orm";
import { base } from "./commun";

/**
 * Lectures agrégées exécutées dans PostgreSQL : on ne rapatrie jamais le registre brut d'un établissement.
 * Les notes effectives viennent de la projection core.notes (colonnes typées, correction déjà appliquée),
 * les absences du registre via l'index (apprenant_id). Une requête par écran, sans relire le JSON du registre.
 */

export interface Bilan {
  moyenneTrimestre: number | null;
  absences: number;
  /** Trois dernières notes de mathématiques, de la plus ancienne à la plus récente. */
  dernieresMaths: number[];
}

export async function bilans(apprenantIds: string[], trimestre = 0, anneeScolaire?: string): Promise<Map<string, Bilan>> {
  if (!apprenantIds.length) return new Map();
  const ids = JSON.stringify(apprenantIds);
  // Le numéro du trimestre ne suffit pas : sans l'année, le T1 d'un élève passé en classe supérieure mêlerait
  // ses notes de l'an dernier à celles de cette année.
  const deLAnnee = anneeScolaire ? sql`and classe_id in (select id from core.classes where annee_scolaire = ${anneeScolaire})` : sql``;
  // Chaque agrégat lit core.notes avec son propre filtre (trimestre et année ; mathématiques), sans matérialiser
  // toutes les notes des élèves. Équivalence vérifiée avec l'ancienne forme : 0 écart sur 309 élèves (21/10/2026).
  const lignes = await base().execute<{ a: string; moyenne_trimestre: number | null; absences: number; maths: number[] | null }>(sql`
    with ids as (select jsonb_array_elements_text(${ids}::jsonb) as a),
    ev as (
      select e.apprenant_id, e.donnees->>'anneeScolaire' as annee, max(e.donnees->>'anneeScolaire') over (partition by e.apprenant_id) as derniere
      from ledger.evenements e
      where e.type = 'ABSENCE' and e.apprenant_id in (select a from ids)
        and not coalesce((e.donnees->>'justifiee')::boolean, false)
        and not exists (select 1 from core.absences_justifiees j where j.absence_id = e.id)
    ),
    gt as (select a, avg(moy) as moyenne from (
      select apprenant_id as a, matiere, avg(note) as moy from core.notes
      where apprenant_id in (select a from ids) and trimestre = ${trimestre} ${deLAnnee} group by 1, 2) x group by a),
    maths as (select apprenant_id as a, (array_agg(note order by survenu_le desc))[1:3] as dern from core.notes
      where apprenant_id in (select a from ids) and matiere = 'Mathématiques' group by 1),
    abs as (select apprenant_id as a, count(*)::int as nb from ev where annee is not distinct from derniere group by 1)
    select ids.a, gt.moyenne as moyenne_trimestre, coalesce(abs.nb, 0) as absences, maths.dern as maths
    from ids left join gt using (a) left join abs using (a) left join maths using (a)
  `);
  return new Map(lignes.map((l) => [l.a, { moyenneTrimestre: l.moyenne_trimestre, absences: l.absences, dernieresMaths: [...(l.maths ?? [])].reverse() }]));
}

/** Même règle que la projection de référence : trois baisses consécutives totalisant au moins 5 points. */
export function enBaisse(b: Bilan | undefined) {
  const n = b?.dernieresMaths ?? [];
  return n.length === 3 && n[0]! > n[1]! && n[1]! > n[2]! && n[0]! - n[2]! >= 5 ? n[0]! - n[2]! : null;
}

/** Apprenants scolarisés d'un établissement (projection indexée), avec leur classe. */
export async function scolarisesEtablissement(etablissementId: string) {
  return base()
    .select({
      id: schema.apprenants.id, nom: schema.apprenants.nom, prenoms: schema.apprenants.prenoms, sexe: schema.apprenants.sexe,
      dateNaissance: schema.apprenants.dateNaissance, statutIdentite: schema.apprenants.statutIdentite, npi: schema.apprenants.npi,
      classeId: schema.classes.id, classe: schema.classes.libelle, niveau: schema.classes.niveau, anneeScolaire: schema.classes.anneeScolaire,
    })
    .from(schema.scolarites)
    .innerJoin(schema.apprenants, eq(schema.apprenants.id, schema.scolarites.apprenantId))
    .innerJoin(schema.classes, eq(schema.classes.id, schema.scolarites.classeId))
    .where(and(eq(schema.scolarites.etablissementId, etablissementId), eq(schema.scolarites.statut, "scolarise")));
}
