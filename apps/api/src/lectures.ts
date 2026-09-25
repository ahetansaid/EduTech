import { schema } from "@beile/db";
import { and, eq, sql } from "drizzle-orm";
import { base } from "./commun";

/**
 * Lectures agrégées exécutées dans PostgreSQL : on ne rapatrie jamais le registre brut d'un établissement.
 * Les notes effectives viennent de la projection core.notes (colonnes typées, correction déjà appliquée),
 * les absences du registre via l'index (apprenant_id). Une requête par écran, sans relire le JSON du registre.
 */

export interface Bilan {
  moyenne: number | null;
  moyenneTrimestre: number | null;
  absences: number;
  /** Trois dernières notes de mathématiques, de la plus ancienne à la plus récente. */
  dernieresMaths: number[];
}

export async function bilans(apprenantIds: string[], trimestre = 0): Promise<Map<string, Bilan>> {
  if (!apprenantIds.length) return new Map();
  const ids = JSON.stringify(apprenantIds);
  const lignes = await base().execute<{ a: string; moyenne: number | null; moyenne_trimestre: number | null; absences: number; maths: number[] | null }>(sql`
    with ids as (select jsonb_array_elements_text(${ids}::jsonb) as a),
    notes as (select apprenant_id as a, matiere as m, trimestre as t, survenu_le as s, note as n from core.notes where apprenant_id in (select a from ids)),
    ev as (select apprenant_id from ledger.evenements where type = 'ABSENCE' and apprenant_id in (select a from ids)),
    g as (select a, avg(moy) as moyenne from (select a, m, avg(n) as moy from notes group by a, m) x group by a),
    gt as (select a, avg(moy) as moyenne from (select a, m, avg(n) as moy from notes where t = ${trimestre} group by a, m) x group by a),
    maths as (select a, (array_agg(n order by s desc))[1:3] as dern from notes where m = 'Mathématiques' group by a),
    abs as (select apprenant_id as a, count(*)::int as nb from ev group by 1)
    select ids.a, g.moyenne, gt.moyenne as moyenne_trimestre, coalesce(abs.nb, 0) as absences, maths.dern as maths
    from ids left join g using (a) left join gt using (a) left join abs using (a) left join maths using (a)
  `);
  return new Map(lignes.map((l) => [l.a, { moyenne: l.moyenne, moyenneTrimestre: l.moyenne_trimestre, absences: l.absences, dernieresMaths: [...(l.maths ?? [])].reverse() }]));
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
