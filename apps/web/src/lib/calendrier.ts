import type { CategorieEcheance, Echeance } from "@/lib/api/public";

/** Présentation du calendrier scolaire : catégories, dates en français, calculs de durée et d'avancement. */

export const CATEGORIES: Record<CategorieEcheance, { libelle: string; point: string; barre: string; doux: string }> = {
  rentree: { libelle: "Rentrée", point: "bg-blue", barre: "bg-blue", doux: "bg-blue-soft text-accent-ink" },
  trimestre: { libelle: "Trimestres", point: "bg-navy/70", barre: "bg-navy/80", doux: "bg-blue-soft text-accent-ink" },
  conges: { libelle: "Congés", point: "bg-teal", barre: "bg-teal", doux: "bg-success-bg text-success" },
  ferie: { libelle: "Jours fériés", point: "bg-flag-red", barre: "bg-flag-red", doux: "bg-critical-bg text-critical" },
  examen: { libelle: "Examens", point: "bg-flag-yellow", barre: "bg-flag-yellow", doux: "bg-warning-bg text-warning" },
  evaluation: { libelle: "Évaluations", point: "bg-blue/60", barre: "bg-blue/60", doux: "bg-blue-soft text-accent-ink" },
  fin: { libelle: "Fin d'année", point: "bg-navy", barre: "bg-navy", doux: "bg-surface-2 text-ink" },
  autre: { libelle: "Autre", point: "bg-ink-muted", barre: "bg-ink-muted", doux: "bg-surface-2 text-ink-2" },
};

const JOUR = 86_400_000;
export const enDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const jours = (a: string, b: string) => Math.round((enDate(b).getTime() - enDate(a).getTime()) / JOUR);

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => enDate(iso).toLocaleDateString("fr-FR", { timeZone: "UTC", ...o });
export const dateCourte = (iso: string) => fmt(iso, { day: "numeric", month: "short" });
export const dateLongue = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
export const moisAnnee = (iso: string) => fmt(iso, { month: "long", year: "numeric" });

export function periode(e: Pick<Echeance, "debut" | "fin">) {
  if (e.debut === e.fin) return fmt(e.debut, { weekday: "long", day: "numeric", month: "long" });
  const memeMois = e.debut.slice(0, 7) === e.fin.slice(0, 7);
  return `du ${fmt(e.debut, memeMois ? { day: "numeric" } : { day: "numeric", month: "long" })} au ${fmt(e.fin, { day: "numeric", month: "long" })}`;
}

/** Bornes de l'année affichée : du 1er septembre au 31 juillet (la frise). */
export function bornesAnnee(annee: string) {
  const a = Number(annee.slice(0, 4));
  return { debut: `${a}-09-01`, fin: `${a + 1}-07-31` };
}

/** Mois de la frise (septembre → juillet). */
export function moisDeLAnnee(annee: string) {
  const a = Number(annee.slice(0, 4));
  return Array.from({ length: 11 }, (_, i) => {
    const m = (8 + i) % 12, y = m >= 8 ? a : a + 1;
    return { cle: `${y}-${String(m + 1).padStart(2, "0")}`, court: new Date(Date.UTC(y, m, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "") };
  });
}

/** Position d'une date sur la frise, en pourcentage (bornée). */
export function position(annee: string, iso: string) {
  const b = bornesAnnee(annee);
  const total = jours(b.debut, b.fin) + 1;
  return Math.min(100, Math.max(0, (jours(b.debut, iso) / total) * 100));
}

/** Avancement de l'année scolaire : de la rentrée à la fin d'année. */
export function avancement(evenements: Echeance[], auj: string) {
  const rentree = evenements.find((e) => e.categorie === "rentree")?.debut ?? evenements[0]?.debut;
  const fin = evenements.filter((e) => e.categorie === "fin").at(-1)?.fin ?? evenements.at(-1)?.fin;
  if (!rentree || !fin) return null;
  const total = Math.max(1, jours(rentree, fin));
  const ecoule = jours(rentree, auj);
  return { rentree, fin, avant: ecoule < 0, apres: ecoule > total, pourcentage: Math.min(100, Math.max(0, (ecoule / total) * 100)), joursAvantRentree: -ecoule, joursRestants: Math.max(0, total - ecoule) };
}

/**
 * Prochaine échéance ponctuelle (congés, férié, examen…) — les trimestres sont des périodes de fond, pas des échéances —
 * et, à part, le trimestre en cours (semaine n sur N).
 */
export function prochaine(evenements: Echeance[], auj: string) {
  const t = evenements.find((e) => e.categorie === "trimestre" && e.debut <= auj && auj <= e.fin);
  const periodeEnCours = t ? { titre: t.titre, semaine: Math.floor(jours(t.debut, auj) / 7) + 1, semaines: Math.ceil((jours(t.debut, t.fin) + 1) / 7) } : null;
  const ponctuels = evenements.filter((e) => e.categorie !== "trimestre");
  const enCours = ponctuels.find((e) => e.debut <= auj && auj <= e.fin);
  if (enCours) return { echeance: enCours, enCours: true, dans: 0, periodeEnCours };
  const suivante = ponctuels.find((e) => e.debut > auj);
  return suivante ? { echeance: suivante, enCours: false, dans: jours(auj, suivante.debut), periodeEnCours } : null;
}

/** Lignes de la frise : uniquement celles qui ont des échéances. */
export function lignesFrise(evenements: Echeance[]) {
  const groupes: { libelle: string; categories: Echeance["categorie"][] }[] = [
    { libelle: "Trimestres", categories: ["trimestre"] },
    { libelle: "Congés", categories: ["conges"] },
    { libelle: "Examens", categories: ["examen", "evaluation"] },
    { libelle: "Fériés et étapes", categories: ["ferie", "rentree", "fin", "autre"] },
  ];
  return groupes.map((g) => ({ ...g, echeances: evenements.filter((e) => g.categories.includes(e.categorie)) })).filter((g) => g.echeances.length);
}
