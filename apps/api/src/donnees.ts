import type { Apprenant, Classe, Enseignant, Evenement, LienFamilial, Niveau, Profil } from "@beile/contracts";
import { NIVEAUX } from "@beile/contracts";
import { schema, type Base } from "@beile/db";
import { ANNEES, type Annee, type CelluleNiveau, type CommuneStats, type CouchesNationales, type EtablissementGenere, type StatCommuneAnnee } from "@beile/simulation/macro";
import type { Enseignement, MicroMonde } from "@beile/simulation/micro";
import { and, eq, inArray, sql } from "drizzle-orm";
import { indexer } from "@beile/simulation/projections";

/**
 * Accès aux données : la source de vérité est désormais PostgreSQL. Les moteurs (couche sémantique,
 * ABAC, projections) restent ceux de @beile/simulation — seule leur alimentation change.
 */

/* ------------------------------------------------------------------ Cube national (couche sémantique) */

let cache: { couches: CouchesNationales; charge: number } | null = null;
const DUREE_CACHE_MS = 5 * 60_000;

let enVol: Promise<CouchesNationales> | null = null;

/**
 * Cube national en mémoire : un seul chargement à la fois (single-flight — pas d'effet de troupeau à froid),
 * et rafraîchissement en arrière-plan une fois périmé (les requêtes servent le cube précédent pendant ce temps).
 */
export async function chargerCouches(db: Base): Promise<CouchesNationales> {
  if (cache && Date.now() - cache.charge < DUREE_CACHE_MS) return cache.couches;
  enVol ??= chargerCouchesDepuisBase(db).finally(() => { enVol = null; });
  if (cache) { enVol.catch((e) => console.error("Rafraîchissement du cube :", e)); return cache.couches; }
  return enVol;
}

/**
 * Mémoïsation d'un calcul dérivé du cube : le résultat vit aussi longtemps que l'instance du cube
 * (WeakMap) — invalidation automatique au rechargement, aucune donnée plus ancienne que le cube lui-même.
 */
const memos = new WeakMap<CouchesNationales, Map<string, unknown>>();
export function memo<T>(couches: CouchesNationales, cle: string, calcul: () => T): T {
  let m = memos.get(couches);
  if (!m) { m = new Map(); memos.set(couches, m); }
  if (m.has(cle)) return m.get(cle) as T;
  const v = calcul();
  // Borne mémoire : les clés peuvent dépendre de requêtes utilisateur (indicateurs) ; au-delà, calcul sans stockage.
  if (m.size < 2000) m.set(cle, v);
  return v;
}

async function chargerCouchesDepuisBase(db: Base): Promise<CouchesNationales> {
  const [communes, cellules, parAnnee, etabs] = await Promise.all([
    db.select({ id: schema.communes.id, departementId: schema.communes.departementId, milieu: schema.communes.milieu }).from(schema.communes),
    db.select().from(schema.cellules),
    db.select().from(schema.communesAnnee),
    db.select({
      id: schema.etablissements.id, nom: schema.etablissements.nom, cycle: schema.etablissements.cycle, statut: schema.etablissements.statut,
      communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription,
      lng: sql<number>`ST_X(${schema.etablissements.position})`, lat: sql<number>`ST_Y(${schema.etablissements.position})`,
      capacite: schema.etablissements.capacite, sallesDeClasse: schema.etablissements.sallesDeClasse, infrastructures: schema.etablissements.infrastructures,
      effectif: schema.etablissements.effectifDeclare, enseignants: schema.etablissements.enseignantsDeclares, transmis: schema.etablissements.transmis,
    }).from(schema.etablissements),
  ]);

  const stats = new Map<string, CommuneStats>();
  for (const c of communes) {
    stats.set(c.id, { communeId: c.id, departementId: c.departementId, milieu: c.milieu, annees: {} as Record<Annee, StatCommuneAnnee>, examens: {} as CommuneStats["examens"], projection2030: 0, distanceMoyenneKm: 0 });
  }
  for (const a of parAnnee) {
    const c = stats.get(a.communeId);
    if (!c) continue;
    const niveaux = {} as Record<Niveau, CelluleNiveau>;
    for (const n of NIVEAUX) niveaux[n] = { effectifF: 0, effectifM: 0, notes: { Mathématiques: { F: { moy: 0, et: 1 }, M: { moy: 0, et: 1 } }, Français: { F: { moy: 0, et: 1 }, M: { moy: 0, et: 1 } } } };
    c.annees[a.annee as Annee] = {
      niveaux, capacite: a.capacite, enseignants: a.enseignants, enseignantsQualifies: a.enseignantsQualifies, tauxAbsenteisme: a.tauxAbsenteisme,
      tauxAbandon: a.tauxAbandon, populationScolarisable: a.populationScolarisable, couverture: a.couverture, fraicheurJours: a.fraicheurJours,
    };
    c.examens[a.annee as Annee] = a.examens as CommuneStats["examens"][Annee];
  }
  for (const x of cellules) {
    const cell = stats.get(x.communeId)?.annees[x.annee as Annee]?.niveaux[x.niveau as Niveau];
    if (!cell) continue;
    if (x.sexe === "F") cell.effectifF = x.effectif; else cell.effectifM = x.effectif;
    cell.notes.Mathématiques[x.sexe] = { moy: x.moyMaths, et: x.etMaths };
    cell.notes.Français[x.sexe] = { moy: x.moyFrancais, et: x.etFrancais };
  }
  for (const c of stats.values()) if (ANNEES.some((a) => !c.annees[a])) stats.delete(c.communeId);

  const etablissements = etabs.map((e) => ({ ...e, lat: Number(e.lat), lng: Number(e.lng), indicePerformance: 1 }) as EtablissementGenere);
  const parCommune = new Map<string, EtablissementGenere[]>();
  for (const e of etablissements) parCommune.set(e.communeId, [...(parCommune.get(e.communeId) ?? []), e]);
  const couches = { communes: stats, etablissements, etablissementsParCommune: parCommune };
  cache = { couches, charge: Date.now() };
  return couches;
}

/* ------------------------------------------------------------------ Profils */

export async function profilParId(db: Base, id: string): Promise<Profil | null> {
  const [p] = await db.select().from(schema.profils).where(eq(schema.profils.id, id));
  return p ? ({ ...p, habilitations: p.habilitations as Profil["habilitations"] }) : null;
}

/* ------------------------------------------------------------------ Contexte d'une décision d'accès */

const enEvenement = (r: typeof schema.evenements.$inferSelect): Evenement =>
  ({ ...(r.donnees as object), id: r.id, type: r.type, survenuLe: r.survenuLe.toISOString(), enregistreLe: r.enregistreLe.toISOString(), auteurId: r.auteurId, source: r.source, etablissementId: r.etablissementId }) as Evenement;

/**
 * Construit le sous-ensemble du monde nécessaire pour décider d'un accès au dossier d'un apprenant :
 * ses événements, sa classe, ses liens familiaux, et la relation pédagogique de l'éventuel enseignant.
 * Aucune autre donnée individuelle n'est chargée.
 */
export async function contexteApprenant(db: Base, apprenantId: string, profil: Profil): Promise<{ monde: MicroMonde; evenements: Evenement[]; apprenant: Apprenant | null }> {
  // Requêtes indépendantes en parallèle : le coût est celui de deux allers-retours, pas de six.
  const [[apprenant], lignes, liens, enseignants] = await Promise.all([
    db.select().from(schema.apprenants).where(eq(schema.apprenants.id, apprenantId)),
    db.select().from(schema.evenements).where(eq(schema.evenements.apprenantId, apprenantId)).orderBy(schema.evenements.survenuLe),
    db.select().from(schema.liensFamiliaux).where(eq(schema.liensFamiliaux.apprenantId, apprenantId)),
    profil.npi ? db.select().from(schema.enseignants).where(eq(schema.enseignants.npi, profil.npi)) : Promise.resolve([]),
  ]);
  const evenements = lignes.map(enEvenement);
  const classeIds = [...new Set(evenements.flatMap((e) => ("classeId" in e ? [e.classeId] : "versClasseId" in e ? [e.versClasseId] : [])))];
  const [classes, enseignements] = await Promise.all([
    classeIds.length ? db.select().from(schema.classes).where(inArray(schema.classes.id, classeIds)) : Promise.resolve([]),
    enseignants[0] && classeIds.length
      ? db.select().from(schema.enseignements).where(and(eq(schema.enseignements.enseignantId, enseignants[0].id), inArray(schema.enseignements.classeId, classeIds)))
      : Promise.resolve([]),
  ]);
  const monde: MicroMonde = {
    etablissements: [], registre: [], certificats: [], profils: [profil], enfantsAInscrire: [],
    apprenants: apprenant ? [apprenant as Apprenant] : [],
    enseignants: enseignants as Enseignant[],
    liens: liens as LienFamilial[],
    classes: classes as Classe[],
    enseignements: enseignements as Enseignement[],
    evenements,
  };
  return { monde, evenements, apprenant: (apprenant as Apprenant) ?? null };
}

export { enEvenement };

/* ------------------------------------------------------------------ Établissement complet */

/**
 * Charge le périmètre d'un établissement : ses classes, ses apprenants actuellement scolarisés, leurs
 * événements (parcours complet), ses enseignants et la relation pédagogique. Une requête par table.
 */
export async function chargerEtablissement(db: Base, etablissementId: string) {
  const [etab] = await db.select().from(schema.etablissements).where(eq(schema.etablissements.id, etablissementId));
  if (!etab) return null;
  const classes = (await db.select().from(schema.classes).where(eq(schema.classes.etablissementId, etablissementId))) as Classe[];
  const idsClasses = classes.map((c) => c.id);
  // Apprenants ayant au moins un événement dans l'établissement, puis leur parcours complet.
  const ids = (await db.selectDistinct({ id: schema.evenements.apprenantId }).from(schema.evenements).where(eq(schema.evenements.etablissementId, etablissementId))).map((r) => r.id).filter((x): x is string => !!x);
  const evenements = ids.length ? (await db.select().from(schema.evenements).where(inArray(schema.evenements.apprenantId, ids)).orderBy(schema.evenements.survenuLe)).map(enEvenement) : [];
  const idx = indexer(evenements);
  const scolarises = ids.filter((id) => { const cl = idx.classeCourante.get(id); return cl && idsClasses.includes(cl); });
  const apprenants = scolarises.length ? ((await db.select().from(schema.apprenants).where(inArray(schema.apprenants.id, scolarises))) as Apprenant[]) : [];
  const enseignants = (await db.select().from(schema.enseignants).where(eq(schema.enseignants.etablissementId, etablissementId))) as Enseignant[];
  const enseignements = idsClasses.length ? ((await db.select().from(schema.enseignements).where(inArray(schema.enseignements.classeId, idsClasses))) as Enseignement[]) : [];
  const monde: MicroMonde = { etablissements: [], registre: [], certificats: [], profils: [], enfantsAInscrire: [], apprenants, enseignants, liens: [], classes, enseignements, evenements };
  return { etab, classes, apprenants, enseignants, enseignements, evenements, idx, monde };
}
export type PerimetreEtablissement = NonNullable<Awaited<ReturnType<typeof chargerEtablissement>>>;
