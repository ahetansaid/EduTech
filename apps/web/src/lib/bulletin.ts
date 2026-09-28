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

/** Bulletin d'un dossier famille/apprenant (tous les événements sont déjà côté client). */
export function bulletinDepuisDossier(d: Dossier, trimestre: number): BulletinView {
  const notes = notesEffectives(d.evenements);
  const annee = anneeCourante(d, notes);
  const jours = absencesParJour(d.evenements);
  return {
    apprenant: {
      id: d.apprenant.id,
      nom: d.apprenant.nom,
      prenoms: d.apprenant.prenoms,
      classe: d.situation.classe?.libelle ?? null,
      etablissement: d.situation.etablissementId ? d.etablissements[d.situation.etablissementId] ?? null : null,
      anneeScolaire: annee,
    },
    trimestre,
    matieres: moyennesParMatiere(notes, annee, trimestre).map((m) => ({ matiere: m.matiere as string, moyenne: m.moyenne, nb: m.nb })),
    moyenneGenerale: moyenneGenerale(notes, annee, trimestre),
    absences: { total: jours.length, justifiees: jours.filter((j) => j.statut === "justifiee").length },
    genereLe: new Date().toISOString(),
  };
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
