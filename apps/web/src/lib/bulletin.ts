import {
  absencesParJour, anneeCourante, moyenneGenerale, moyennesParMatiere, notesEffectives,
  type Dossier,
} from "@/lib/api/parcours";
import type { DossierGestion } from "@/lib/api/etablissement";

/**
 * Bulletin trimestriel : modèle d'affichage unique, calculé à partir de données déjà autorisées.
 * Aucune valeur n'est inventée — une matière sans note n'apparaît pas, la moyenne générale reste
 * non pondérée (l'API ne transmet pas de coefficients). Le document est imprimé par le navigateur.
 */

export interface LigneBulletin {
  matiere: string;
  moyenne: number;
  nb: number;
}

export interface BulletinView {
  apprenant: {
    id: string;
    nom: string;
    prenoms: string;
    classe: string | null;
    etablissement: string | null;
    anneeScolaire: string | null;
  };
  trimestre: number;
  matieres: LigneBulletin[];
  moyenneGenerale: number | null;
  absences: { total: number; justifiees: number };
  genereLe: string;
}

/** Trimestres effectivement notés d'un dossier famille/apprenant (pour le sélecteur de bulletin). */
export function trimestresNotes(d: Dossier): number[] {
  const notes = notesEffectives(d.evenements);
  const annee = anneeCourante(d, notes);
  return [...new Set(notes.filter((n) => n.anneeScolaire === annee).map((n) => n.trimestre))].sort((a, b) => a - b);
}

/**
 * Bulletin d'un dossier famille/apprenant (tous les événements sont déjà côté client), pour l'année
 * demandée (l'année en cours par défaut). Une année passée garde son établissement (porté par les notes) ;
 * sa classe n'est affichée que si c'est la classe actuelle — le dossier ne conserve pas les libellés passés,
 * et un libellé deviné serait faux. Les absences sont celles de l'année du bulletin, pas du parcours entier.
 */
export function bulletinDepuisDossier(d: Dossier, trimestre: number, anneeDemandee?: string | null): BulletinView {
  const notes = notesEffectives(d.evenements);
  const annee = anneeDemandee ?? anneeCourante(d, notes);
  const deLAnnee = notes.filter((n) => n.anneeScolaire === annee);
  const classeId = deLAnnee.at(-1)?.classeId ?? null;
  const etablissementId = deLAnnee.at(-1)?.etablissementId ?? d.situation.etablissementId;
  const courante = annee === d.situation.classe?.anneeScolaire || (classeId != null && classeId === d.situation.classe?.id);
  const bornes = annee ? { debut: `${annee.slice(0, 4)}-09-01`, fin: `${Number(annee.slice(0, 4)) + 1}-07-31` } : null;
  const jours = absencesParJour(d.evenements).filter((j) => !bornes || (j.date >= bornes.debut && j.date <= bornes.fin));
  return {
    apprenant: {
      id: d.apprenant.id,
      nom: d.apprenant.nom,
      prenoms: d.apprenant.prenoms,
      classe: courante ? d.situation.classe?.libelle ?? null : null,
      etablissement: etablissementId ? d.etablissements[etablissementId] ?? null : null,
      anneeScolaire: annee,
    },
    trimestre,
    matieres: moyennesParMatiere(notes, annee, trimestre).map((m) => ({ matiere: m.matiere as string, moyenne: m.moyenne, nb: m.nb })),
    moyenneGenerale: moyenneGenerale(notes, annee, trimestre),
    absences: { total: jours.length, justifiees: jours.filter((j) => j.statut === "justifiee").length },
    genereLe: new Date().toISOString(),
  };
}

/** Tous les trimestres notés du parcours, du plus récent au plus ancien, avec leur moyenne générale. */
export function periodesBulletin(d: Dossier): { annee: string; trimestre: number; moyenne: number | null; matieres: number }[] {
  const notes = notesEffectives(d.evenements);
  const cles = [...new Set(notes.map((n) => `${n.anneeScolaire}|${n.trimestre}`))];
  return cles.map((k) => {
    const [annee, t] = k.split("|") as [string, string];
    return { annee, trimestre: Number(t), moyenne: moyenneGenerale(notes, annee, Number(t)), matieres: moyennesParMatiere(notes, annee, Number(t)).length };
  }).sort((a, b) => b.annee.localeCompare(a.annee) || b.trimestre - a.trimestre);
}

/** Bulletin du dossier de gestion (chef d'établissement) : moyennes déjà calculées par l'API. */
export function bulletinDepuisGestion(d: DossierGestion): BulletinView {
  const generale = d.moyennes.length ? d.moyennes.reduce((s, m) => s + m.moyenne, 0) / d.moyennes.length : null;
  return {
    apprenant: {
      id: d.apprenant.id,
      nom: d.apprenant.nom,
      prenoms: d.apprenant.prenoms,
      classe: d.situation.classe,
      etablissement: d.situation.etablissement,
      anneeScolaire: d.situation.anneeScolaire ?? null,
    },
    trimestre: d.trimestre,
    matieres: d.moyennes.map((m) => ({ matiere: m.matiere, moyenne: m.moyenne, nb: m.nombre })),
    moyenneGenerale: generale,
    absences: { total: d.absences, justifiees: 0 },
    genereLe: new Date().toISOString(),
  };
}
