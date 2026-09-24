import type { Classe, Evenement } from "@beile/contracts";
import type { MicroMonde } from "./micro";

/**
 * Projections : l'état courant n'est pas stocké, il est recalculé à partir du registre d'événements.
 * C'est ce qui permet de reconstituer un parcours complet, y compris après un transfert.
 *
 * Un index est construit une seule fois par version du registre (le tableau d'événements est
 * immuable : toute nouvelle saisie produit un nouveau tableau). Les lectures deviennent en O(1)
 * au lieu de reparcourir tout le registre pour chaque apprenant.
 */

export interface Situation {
  classe: Classe | null;
  etablissementId: string | null;
  statut: "scolarise" | "abandon" | "non_inscrit";
}

export type NoteEffective = Extract<Evenement, { type: "EVALUATION" }> & { corrigee: boolean };

interface Index {
  parApprenant: Map<string, Evenement[]>;
  notes: NoteEffective[];
  notesParApprenant: Map<string, NoteEffective[]>;
  classeCourante: Map<string, string | null>;
  statut: Map<string, Situation["statut"]>;
  parClasse: Map<string, Set<string>>;
}

const cacheIndex = new WeakMap<Evenement[], Index>();
const cacheClasses = new WeakMap<Classe[], Map<string, Classe>>();

export function indexer(evenements: Evenement[]): Index {
  const existant = cacheIndex.get(evenements);
  if (existant) return existant;
  const parApprenant = new Map<string, Evenement[]>();
  const corrections = new Map<string, number>();
  const classeCourante = new Map<string, string | null>();
  const statut = new Map<string, Situation["statut"]>();
  for (const e of evenements) {
    if (e.type === "CORRECTION_EVALUATION") corrections.set(e.evenementCorrigeId, e.nouvelleNote);
    if (!("apprenantId" in e)) continue;
    const l = parApprenant.get(e.apprenantId);
    if (l) l.push(e); else parApprenant.set(e.apprenantId, [e]);
    if (e.type === "INSCRIPTION" || e.type === "REPRISE") { classeCourante.set(e.apprenantId, e.classeId); statut.set(e.apprenantId, "scolarise"); }
    else if (e.type === "TRANSFERT") { classeCourante.set(e.apprenantId, e.versClasseId); statut.set(e.apprenantId, "scolarise"); }
    else if (e.type === "ABANDON") { classeCourante.set(e.apprenantId, null); statut.set(e.apprenantId, "abandon"); }
  }
  for (const l of parApprenant.values()) l.sort((a, b) => a.survenuLe.localeCompare(b.survenuLe));
  const notes: NoteEffective[] = [];
  const notesParApprenant = new Map<string, NoteEffective[]>();
  for (const e of evenements) {
    if (e.type !== "EVALUATION") continue;
    const n: NoteEffective = { ...e, note: corrections.get(e.id) ?? e.note, corrigee: corrections.has(e.id) };
    notes.push(n);
    const l = notesParApprenant.get(e.apprenantId);
    if (l) l.push(n); else notesParApprenant.set(e.apprenantId, [n]);
  }
  const parClasse = new Map<string, Set<string>>();
  for (const [id, c] of classeCourante) {
    if (!c) continue;
    const s = parClasse.get(c);
    if (s) s.add(id); else parClasse.set(c, new Set([id]));
  }
  const index = { parApprenant, notes, notesParApprenant, classeCourante, statut, parClasse };
  cacheIndex.set(evenements, index);
  return index;
}

function classeParId(classes: Classe[], id: string) {
  let m = cacheClasses.get(classes);
  if (!m) { m = new Map(classes.map((c) => [c.id, c])); cacheClasses.set(classes, m); }
  return m.get(id) ?? null;
}

export function situationApprenant(monde: MicroMonde, evenements: Evenement[], apprenantId: string): Situation {
  const idx = indexer(evenements);
  const classeId = idx.classeCourante.get(apprenantId) ?? null;
  const classe = classeId ? classeParId(monde.classes, classeId) : null;
  return { classe, etablissementId: classe?.etablissementId ?? null, statut: idx.statut.get(apprenantId) ?? "non_inscrit" };
}

export function evenementsApprenant(evenements: Evenement[], apprenantId: string): Evenement[] {
  return indexer(evenements).parApprenant.get(apprenantId) ?? [];
}

/** Notes effectives : une correction remplace la note d'origine sans l'effacer du registre. */
export function notesEffectives(evenements: Evenement[]): NoteEffective[] {
  return indexer(evenements).notes;
}

export function notesApprenant(evenements: Evenement[], apprenantId: string): NoteEffective[] {
  return indexer(evenements).notesParApprenant.get(apprenantId) ?? [];
}

export function effectifClasse(monde: MicroMonde, evenements: Evenement[], classeId: string) {
  const ids = indexer(evenements).parClasse.get(classeId);
  return ids ? monde.apprenants.filter((a) => ids.has(a.id)) : [];
}

export function moyenne(valeurs: number[]) {
  return valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null;
}

/** Élèves dont les trois dernières notes d'une matière baissent d'au moins 5 points au total. */
export function elevesEnBaisse(evenements: Evenement[], apprenantIds: Set<string>, matiere = "Mathématiques") {
  const idx = indexer(evenements);
  const res: { apprenantId: string; notes: number[]; baisse: number }[] = [];
  for (const id of apprenantIds) {
    const n = (idx.notesParApprenant.get(id) ?? []).filter((x) => x.matiere === matiere).sort((a, b) => a.survenuLe.localeCompare(b.survenuLe)).slice(-3).map((x) => x.note);
    if (n.length === 3 && n[0]! > n[1]! && n[1]! > n[2]! && n[0]! - n[2]! >= 5) res.push({ apprenantId: id, notes: n, baisse: n[0]! - n[2]! });
  }
  return res.sort((a, b) => b.baisse - a.baisse);
}
