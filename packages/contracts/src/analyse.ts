import { z } from "zod";
import type { MotifRefus, RequeteSemantique, ResultatIndicateur } from "./semantique";

/**
 * Moteur d'analyse déterministe (au-dessus de la couche sémantique).
 *
 * Une question est rangée dans une famille ; chaque famille a son algorithme, ses figures et ses gabarits
 * de phrases. Aucun modèle de langage : les chiffres viennent tous de `calculer()`, les phrases de règles,
 * et chaque réponse porte les résultats bruts qui l'ont produite (définition, source, confiance).
 */

export const FamilleQuestion = z.enum([
  "niveau", "comparaison", "classement", "evolution", "repartition", "ecart", "carte", "anomalies", "projection",
]);
export type FamilleQuestion = z.infer<typeof FamilleQuestion>;

export const FAMILLE_LIBELLE: Record<FamilleQuestion, string> = {
  niveau: "Valeur et situation",
  comparaison: "Comparaison",
  classement: "Classement",
  evolution: "Évolution",
  repartition: "Répartition",
  ecart: "Écart et équité",
  carte: "Lecture géographique",
  anomalies: "Anomalies",
  projection: "Projection",
};

export const QuestionAnalyse = z.object({ question: z.string().trim().min(3).max(400) }).strict();

/** Ton d'un constat : lu par rapport au sens favorable de l'indicateur, jamais deviné. */
export type TonConstat = "favorable" | "defavorable" | "neutre" | "alerte";
export interface ConstatAnalyse { texte: string; ton: TonConstat }

export interface BarreAnalyse { cle: string; libelle: string; valeur: number | null; accent?: boolean; masquee?: boolean; effectif?: number }
export interface SerieAnalyse { nom: string; points: { x: string; y: number | null }[]; pointille?: boolean; discret?: boolean }

/** Figures : une description, pas un dessin. Le client choisit le composant, le serveur choisit la figure. */
export type FigureAnalyse =
  | { type: "chiffre"; titre: string; valeur: number | null; reference?: { libelle: string; valeur: number | null } | null; rang?: { position: number; sur: number; libelle: string } | null }
  | { type: "barres"; titre: string; barres: BarreAnalyse[]; reference?: { libelle: string; valeur: number } | null; limite?: number }
  | { type: "courbes"; titre: string; series: SerieAnalyse[] }
  | { type: "carte"; titre: string; niveau: "communes" | "departements"; valeurs: Record<string, number | null>; focusDepartement?: string | null }
  | { type: "haltere"; titre: string; libelleA: string; libelleB: string; lignes: { cle: string; libelle: string; a: number | null; b: number | null }[] };

export interface SuggestionAnalyse { libelle: string; question: string }

export type ReponseAnalyse =
  | {
      statut: "repondu";
      question: string;
      famille: FamilleQuestion;
      titre: string;
      interpretation: string[];
      unite: ResultatIndicateur["definition"]["unite"];
      constats: ConstatAnalyse[];
      figures: FigureAnalyse[];
      /** Les résultats bruts du moteur : définition, source, couverture, confiance de chaque calcul. */
      resultats: ResultatIndicateur[];
      suggestions: SuggestionAnalyse[];
      avertissements: string[];
    }
  | {
      statut: "refuse";
      question: string;
      motif: MotifRefus;
      explication: string;
      requete: RequeteSemantique | null;
      suggestions: SuggestionAnalyse[];
    };
