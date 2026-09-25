import type { Evenement, Matiere } from "@beile/contracts";
import { evenementsApprenant, notesApprenant } from "./projections";

/** Lectures de scolarité calculées depuis le registre d'événements (partagées par l'API et l'interface). */

export function moyennesParMatiere(evenements: Evenement[], apprenantId: string, trimestre?: number) {
  const parMatiere = new Map<Matiere, number[]>();
  for (const e of notesApprenant(evenements, apprenantId)) {
    if (trimestre && e.trimestre !== trimestre) continue;
    parMatiere.set(e.matiere, [...(parMatiere.get(e.matiere) ?? []), e.note]);
  }
  return [...parMatiere.entries()].map(([matiere, notes]) => ({ matiere, moyenne: notes.reduce((s, n) => s + n, 0) / notes.length, notes }));
}

export function moyenneGenerale(evenements: Evenement[], apprenantId: string, trimestre?: number) {
  const m = moyennesParMatiere(evenements, apprenantId, trimestre);
  return m.length ? m.reduce((s, x) => s + x.moyenne, 0) / m.length : null;
}

export function absences(evenements: Evenement[], apprenantId: string) {
  return evenementsApprenant(evenements, apprenantId).filter((e): e is Extract<Evenement, { type: "ABSENCE" }> => e.type === "ABSENCE").sort((a, b) => b.date.localeCompare(a.date));
}

export const aujourdhui = () => new Date().toISOString().slice(0, 10);
