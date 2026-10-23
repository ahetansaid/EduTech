import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { base } from "./commun";
import { bilans, type Bilan } from "./lectures";

/**
 * Trimestre de référence — une seule règle pour toute la gestion (tableau de bord, personnel, classes de
 * l'enseignant, dossier d'un apprenant, saisie des notes). Il dépend de l'ANNÉE SCOLAIRE de la classe :
 *   - une année que le calendrier officiel couvre : le trimestre en cours, ou pendant les congés le dernier
 *     commencé (avant la rentrée : le premier) ;
 *   - une année que le calendrier ne couvre pas (année close, jeu de démonstration) : le dernier trimestre où
 *     des notes existent pour ces classes ; à défaut, le premier.
 * `source` dit d'où vient le trimestre : un écran ne présente jamais une déduction comme le calendrier.
 */
export type SourcePeriode = "calendrier" | "notes" | "defaut";
export interface Periode { anneeScolaire: string; trimestre: number; source: SourcePeriode }

/** Trimestre du calendrier pour cette année scolaire, ou `null` si le calendrier ne la couvre pas. */
export async function trimestreAuCalendrier(anneeScolaire: string, jour = aujourdhui()): Promise<number | null> {
  const debuts = await base().select({ debut: schema.calendrier.debut }).from(schema.calendrier)
    .where(and(eq(schema.calendrier.annee, anneeScolaire), eq(schema.calendrier.categorie, "trimestre")))
    .orderBy(asc(schema.calendrier.debut));
  if (!debuts.length) return null;
  const commences = debuts.filter((d) => String(d.debut) <= jour).length;
  return Math.min(3, Math.max(1, commences));
}

/** Date d'ouverture d'un trimestre au calendrier (pour le dire à qui saisit trop tôt), ou `null`. */
export async function ouvertureDuTrimestre(anneeScolaire: string, trimestre: number): Promise<string | null> {
  const debuts = await base().select({ debut: schema.calendrier.debut }).from(schema.calendrier)
    .where(and(eq(schema.calendrier.annee, anneeScolaire), eq(schema.calendrier.categorie, "trimestre")))
    .orderBy(asc(schema.calendrier.debut));
  return debuts[trimestre - 1] ? String(debuts[trimestre - 1]!.debut) : null;
}

/** Dates d'un trimestre au calendrier (début, fin), ou `null` si le calendrier ne couvre pas l'année. */
export async function bornesDuTrimestre(anneeScolaire: string, trimestre: number): Promise<{ debut: string; fin: string } | null> {
  const lignes = await base().select({ debut: schema.calendrier.debut, fin: schema.calendrier.fin }).from(schema.calendrier)
    .where(and(eq(schema.calendrier.annee, anneeScolaire), eq(schema.calendrier.categorie, "trimestre")))
    .orderBy(asc(schema.calendrier.debut));
  const t = lignes[trimestre - 1];
  return t ? { debut: String(t.debut), fin: String(t.fin) } : null;
}

/** Période de référence de chaque année scolaire présente parmi ces classes. */
export async function periodesDesClasses(classes: { id: string; anneeScolaire: string }[]): Promise<Map<string, Periode>> {
  const parAnnee = new Map<string, string[]>();
  for (const c of classes) parAnnee.set(c.anneeScolaire, [...(parAnnee.get(c.anneeScolaire) ?? []), c.id]);
  const periodes = new Map<string, Periode>();
  await Promise.all([...parAnnee].map(async ([anneeScolaire, ids]) => {
    const t = await trimestreAuCalendrier(anneeScolaire);
    if (t) return void periodes.set(anneeScolaire, { anneeScolaire, trimestre: t, source: "calendrier" });
    // Repli sur les notes de TOUTES les classes de l'année dans les mêmes établissements : une classe qui n'a reçu que
    // des élèves changés de classe ou transférés (aucune note propre) ne retombe pas au trimestre 1.
    const [r] = await base().select({ t: sql<number | null>`max(${schema.notes.trimestre})::int` }).from(schema.notes)
      .where(sql`${schema.notes.classeId} in (select k.id from ${schema.classes} k where k.annee_scolaire = ${anneeScolaire}
        and k.etablissement_id in (select c.etablissement_id from ${schema.classes} c where ${inArray(sql`c.id`, ids)}))`);
    periodes.set(anneeScolaire, r?.t ? { anneeScolaire, trimestre: r.t, source: "notes" } : { anneeScolaire, trimestre: 1, source: "defaut" });
  }));
  return periodes;
}

/** Champs d'en-tête d'une réponse : le trimestre affiché et d'où il vient (année, calendrier ou notes). */
export const enTete = (p: Periode | null) => ({ trimestre: p?.trimestre ?? 1, periode: p });

/** Bilans d'élèves de plusieurs années : chacun au trimestre de référence de l'année de sa classe. */
export async function bilansAuTrimestre(eleves: { id: string; anneeScolaire: string }[], periodes: Map<string, Periode>): Promise<Map<string, Bilan>> {
  const parAnnee = new Map<string, string[]>();
  for (const e of eleves) parAnnee.set(e.anneeScolaire, [...(parAnnee.get(e.anneeScolaire) ?? []), e.id]);
  const parts = await Promise.all([...parAnnee].map(([annee, ids]) => bilans(ids, periodes.get(annee)?.trimestre ?? 0, annee)));
  return new Map(parts.flatMap((m) => [...m]));
}

/**
 * Période qui résume un ensemble de classes pour l'en-tête d'un écran : celle de l'année qui compte le plus
 * d'élèves (à égalité, la plus récente). Les calculs, eux, restent par année : une école peut tenir deux
 * années juste après un conseil de passage.
 */
export function periodePrincipale(periodes: Map<string, Periode>, eleves: { anneeScolaire: string }[] = []): Periode | null {
  const poids = (a: string) => eleves.filter((e) => e.anneeScolaire === a).length;
  return [...periodes.values()].sort((a, b) => poids(b.anneeScolaire) - poids(a.anneeScolaire) || b.anneeScolaire.localeCompare(a.anneeScolaire))[0] ?? null;
}
