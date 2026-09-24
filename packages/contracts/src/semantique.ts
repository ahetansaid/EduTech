import { z } from "zod";
import { Matiere, Milieu, Niveau, Sexe, StatutEtablissement } from "./referentiels";

/**
 * Couche sémantique et dictionnaire national des données (§11.2).
 * Aucun indicateur n'est calculé sans définition publiée.
 */

export const Dimension = z.enum(["sexe", "departement", "commune", "milieu", "statut", "niveau", "annee"]);
export type Dimension = z.infer<typeof Dimension>;

export const DIMENSION_LIBELLE: Record<Dimension, string> = {
  sexe: "Sexe",
  departement: "Département",
  commune: "Commune",
  milieu: "Milieu",
  statut: "Statut de l'établissement",
  niveau: "Niveau",
  annee: "Année scolaire",
};

export const CodeIndicateur = z.enum([
  "effectif_apprenants",
  "taux_seuil_moyenne",
  "moyenne_generale",
  "taux_absenteisme",
  "ratio_apprenants_enseignant",
  "taux_occupation",
  "taux_abandon",
  "taux_reussite_examen",
]);
export type CodeIndicateur = z.infer<typeof CodeIndicateur>;

export const DefinitionIndicateur = z.object({
  code: CodeIndicateur,
  nom: z.string(),
  definition: z.string(),
  formule: z.string(),
  unite: z.enum(["nombre", "pourcentage", "note", "ratio"]),
  source: z.string(),
  frequence: z.string(),
  proprietaire: z.string(),
  version: z.string(),
  dimensions: z.array(Dimension),
  /** Seuil de publication : en dessous, la cellule est masquée (protection contre la réidentification). */
  effectifMinimalPublication: z.number().int(),
});
export type DefinitionIndicateur = z.infer<typeof DefinitionIndicateur>;

/** Requête structurée : seule sortie autorisée du modèle de langage. Le moteur calcule, jamais le LLM. */
export const RequeteSemantique = z.object({
  indicateur: CodeIndicateur,
  filtres: z
    .object({
      anneeScolaire: z.string().optional(),
      departementId: z.string().optional(),
      communeId: z.string().optional(),
      sexe: Sexe.optional(),
      milieu: Milieu.optional(),
      statut: StatutEtablissement.optional(),
      niveau: Niveau.optional(),
      ageMin: z.number().int().optional(),
      ageMax: z.number().int().optional(),
      matiere: Matiere.optional(),
      seuil: z.number().optional(),
    })
    .strict(),
  ventilation: z.array(Dimension).max(2),
});
export type RequeteSemantique = z.infer<typeof RequeteSemantique>;

export const IndiceConfiance = z.object({
  completude: z.number(),
  fraicheur: z.number(),
  coherence: z.number(),
  validation: z.number(),
  score: z.number(),
});
export type IndiceConfiance = z.infer<typeof IndiceConfiance>;

export const LigneResultat = z.object({
  cle: z.string(),
  libelle: z.string(),
  valeur: z.number().nullable(),
  effectif: z.number(),
  masquee: z.boolean(),
});
export type LigneResultat = z.infer<typeof LigneResultat>;

export const ResultatIndicateur = z.object({
  requete: RequeteSemantique,
  definition: DefinitionIndicateur,
  valeur: z.number().nullable(),
  numerateur: z.number().nullable(),
  denominateur: z.number(),
  lignes: z.array(LigneResultat),
  periode: z.string(),
  couverture: z.object({ etablissementsAyantTransmis: z.number(), etablissementsAttendus: z.number() }),
  confiance: IndiceConfiance,
  misAJourLe: z.string(),
});
export type ResultatIndicateur = z.infer<typeof ResultatIndicateur>;

export const MotifRefus = z.enum(["indicateur_inconnu", "question_ambigue", "hors_perimetre", "donnee_individuelle"]);
export type MotifRefus = z.infer<typeof MotifRefus>;

export const ReponseAsk = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("repondu"),
    question: z.string(),
    interpretation: z.string(),
    requete: RequeteSemantique,
    resultat: ResultatIndicateur,
  }),
  z.object({
    statut: z.literal("refuse"),
    question: z.string(),
    motif: MotifRefus,
    explication: z.string(),
    requete: RequeteSemantique.nullable(),
  }),
]);
export type ReponseAsk = z.infer<typeof ReponseAsk>;
