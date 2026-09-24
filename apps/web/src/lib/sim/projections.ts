import type { Classe, Evenement } from "@beile/contracts";
import type { MicroMonde } from "./micro";

/**
 * Projections : l'état courant n'est pas stocké, il est recalculé à partir du registre d'événements.
 * C'est ce qui permet de reconstituer un parcours complet, y compris après un transfert.
 */

export interface Situation {
  classe: Classe | null;
  etablissementId: string | null;
  statut: "scolarise" | "abandon" | "non_inscrit";
}

export function situationApprenant(monde: MicroMonde, evenements: Evenement[], apprenantId: string): Situation {
  let classeId: string | null = null;
  let statut: Situation["statut"] = "non_inscrit";
  for (const e of evenements) {
    if (!("apprenantId" in e) || e.apprenantId !== apprenantId) continue;
    if (e.type === "INSCRIPTION" || e.type === "REPRISE") { classeId = e.classeId; statut = "scolarise"; }
    else if (e.type === "TRANSFERT") { classeId = e.versClasseId; statut = "scolarise"; }
    else if (e.type === "ABANDON") statut = "abandon";
  }
  const classe = classeId ? monde.classes.find((c) => c.id === classeId) ?? null : null;
  return { classe, etablissementId: classe?.etablissementId ?? null, statut };
}

export function evenementsApprenant(evenements: Evenement[], apprenantId: string) {
  return evenements
    .filter((e) => "apprenantId" in e && e.apprenantId === apprenantId)
    .sort((a, b) => a.survenuLe.localeCompare(b.survenuLe));
}

/** Notes effectives : une correction remplace la note d'origine sans l'effacer du registre. */
export function notesEffectives(evenements: Evenement[]) {
  const corrections = new Map<string, number>();
  for (const e of evenements) if (e.type === "CORRECTION_EVALUATION") corrections.set(e.evenementCorrigeId, e.nouvelleNote);
  return evenements
    .filter((e): e is Extract<Evenement, { type: "EVALUATION" }> => e.type === "EVALUATION")
    .map((e) => ({ ...e, note: corrections.get(e.id) ?? e.note, corrigee: corrections.has(e.id) }));
}

export function effectifClasse(monde: MicroMonde, evenements: Evenement[], classeId: string) {
  const ids = new Set<string>();
  const par = new Map<string, string | null>();
  for (const e of evenements) {
    if (!("apprenantId" in e)) continue;
    if (e.type === "INSCRIPTION" || e.type === "REPRISE") par.set(e.apprenantId, e.classeId);
    else if (e.type === "TRANSFERT") par.set(e.apprenantId, e.versClasseId);
    else if (e.type === "ABANDON") par.set(e.apprenantId, null);
  }
  for (const [id, c] of par) if (c === classeId) ids.add(id);
  return monde.apprenants.filter((a) => ids.has(a.id));
}

export function moyenne(valeurs: number[]) {
  return valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null;
}

/** Élèves dont les trois dernières notes d'une matière baissent de plus de 4 points au total. */
export function elevesEnBaisse(evenements: Evenement[], apprenantIds: Set<string>, matiere = "Mathématiques") {
  const parEleve = new Map<string, { note: number; date: string }[]>();
  for (const e of notesEffectives(evenements)) {
    if (e.matiere !== matiere || !apprenantIds.has(e.apprenantId)) continue;
    const l = parEleve.get(e.apprenantId) ?? [];
    l.push({ note: e.note, date: e.survenuLe });
    parEleve.set(e.apprenantId, l);
  }
  const res: { apprenantId: string; notes: number[]; baisse: number }[] = [];
  for (const [id, l] of parEleve) {
    const n = l.sort((a, b) => a.date.localeCompare(b.date)).slice(-3).map((x) => x.note);
    if (n.length === 3 && n[0]! > n[1]! && n[1]! > n[2]! && n[0]! - n[2]! >= 5) res.push({ apprenantId: id, notes: n, baisse: n[0]! - n[2]! });
  }
  return res.sort((a, b) => b.baisse - a.baisse);
}
