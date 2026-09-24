import type { Apprenant, Classe, Evenement, Matiere } from "@beile/contracts";
import type { MicroMonde } from "./sim/micro";
import { DATE_SIMULEE } from "./sim/micro";
import { effectifClasse, notesEffectives, situationApprenant } from "./sim/projections";

/** Fonctions de lecture des parcours individuels (établissements pilotes). */

export const AUJOURDHUI = DATE_SIMULEE.slice(0, 10);

export function moyennesParMatiere(evenements: Evenement[], apprenantId: string, trimestre?: number) {
  const parMatiere = new Map<Matiere, number[]>();
  for (const e of notesEffectives(evenements)) {
    if (e.apprenantId !== apprenantId || (trimestre && e.trimestre !== trimestre)) continue;
    parMatiere.set(e.matiere, [...(parMatiere.get(e.matiere) ?? []), e.note]);
  }
  return [...parMatiere.entries()].map(([matiere, notes]) => ({ matiere, moyenne: notes.reduce((s, n) => s + n, 0) / notes.length, notes }));
}

export function moyenneGenerale(evenements: Evenement[], apprenantId: string, trimestre?: number) {
  const m = moyennesParMatiere(evenements, apprenantId, trimestre);
  return m.length ? m.reduce((s, x) => s + x.moyenne, 0) / m.length : null;
}

export function absences(evenements: Evenement[], apprenantId: string) {
  return evenements.filter((e): e is Extract<Evenement, { type: "ABSENCE" }> => e.type === "ABSENCE" && e.apprenantId === apprenantId).sort((a, b) => b.date.localeCompare(a.date));
}

export function absentsDuJour(evenements: Evenement[], classeId?: string) {
  return evenements.filter((e): e is Extract<Evenement, { type: "ABSENCE" }> => e.type === "ABSENCE" && e.date === AUJOURDHUI && (!classeId || e.classeId === classeId));
}

export function classesEnseignant(monde: MicroMonde, enseignantId: string) {
  const ids = new Set(monde.enseignements.filter((e) => e.enseignantId === enseignantId).map((e) => e.classeId));
  return monde.classes.filter((c) => ids.has(c.id)).map((c) => ({ classe: c, matieres: monde.enseignements.filter((e) => e.enseignantId === enseignantId && e.classeId === c.id).map((e) => e.matiere) }));
}

export function elevesClasse(monde: MicroMonde, evenements: Evenement[], classe: Classe) {
  return effectifClasse(monde, evenements, classe.id).sort((a, b) => a.nom.localeCompare(b.nom, "fr") || a.prenoms.localeCompare(b.prenoms, "fr"));
}

export function elevesEtablissement(monde: MicroMonde, evenements: Evenement[], etablissementId: string): { apprenant: Apprenant; classe: Classe | null }[] {
  return monde.apprenants
    .map((a) => ({ apprenant: a, situation: situationApprenant(monde, evenements, a.id) }))
    .filter((x) => x.situation.etablissementId === etablissementId && x.situation.statut === "scolarise")
    .map((x) => ({ apprenant: x.apprenant, classe: x.situation.classe }));
}

export const ageAu = (dateNaissance: string, ref = AUJOURDHUI) => {
  const n = new Date(dateNaissance), r = new Date(ref);
  return r.getFullYear() - n.getFullYear() - (r < new Date(r.getFullYear(), n.getMonth(), n.getDate()) ? 1 : 0);
};

export const nomComplet = (a: Pick<Apprenant, "prenoms" | "nom">) => `${a.prenoms} ${a.nom}`;
