import { z } from "zod";

/**
 * Contrôle d'accès RBAC + ABAC (document de cadrage §10).
 * Un accès est accordé si et seulement si les quatre critères sont réunis :
 * rôle, périmètre, relation, finalité. Les refus sont journalisés comme les autorisations.
 */

export const Role = z.enum([
  "apprenant",
  "parent",
  "enseignant",
  "chef_etablissement",
  "inspecteur",
  "direction_departementale",
  "administration_centrale",
  "chercheur",
  "dpo",
  "administrateur",
]);
export type Role = z.infer<typeof Role>;

export const Perimetre = z.discriminatedUnion("niveau", [
  z.object({ niveau: z.literal("personnel"), apprenantId: z.string() }),
  z.object({ niveau: z.literal("famille"), responsableNpi: z.string() }),
  z.object({ niveau: z.literal("etablissement"), etablissementId: z.string() }),
  z.object({ niveau: z.literal("circonscription"), circonscription: z.string() }),
  z.object({ niveau: z.literal("departement"), departementId: z.string() }),
  z.object({ niveau: z.literal("national") }),
]);
export type Perimetre = z.infer<typeof Perimetre>;

/** Une habilitation = un rôle exercé sur un périmètre. Un compte peut en cumuler plusieurs. */
export const Habilitation = z.object({ role: Role, perimetre: Perimetre });
export type Habilitation = z.infer<typeof Habilitation>;

export const Finalite = z.enum([
  "consultation_personnelle",
  "suivi_familial",
  "evaluation",
  "gestion",
  "controle",
  "statistique",
  "audit",
]);
export type Finalite = z.infer<typeof Finalite>;

export const FINALITE_LIBELLE: Record<Finalite, string> = {
  consultation_personnelle: "Consultation de son propre dossier",
  suivi_familial: "Suivi de la scolarité de l'enfant",
  evaluation: "Évaluation pédagogique",
  gestion: "Gestion de l'établissement",
  controle: "Contrôle et supervision",
  statistique: "Production statistique",
  audit: "Audit de conformité",
};

export const Profil = z.object({
  id: z.string(),
  nomAffiche: z.string(),
  fonction: z.string(),
  npi: z.string().nullable(),
  habilitations: z.array(Habilitation),
});
export type Profil = z.infer<typeof Profil>;

export const Critere = z.enum(["role", "perimetre", "relation", "finalite"]);
export type Critere = z.infer<typeof Critere>;

export const EvaluationCritere = z.object({
  critere: Critere,
  satisfait: z.boolean(),
  detail: z.string(),
});
export type EvaluationCritere = z.infer<typeof EvaluationCritere>;

export const DecisionAcces = z.object({
  autorise: z.boolean(),
  criteres: z.array(EvaluationCritere),
  /** Habilitation au titre de laquelle l'accès est accordé (lever l'ambiguïté enseignant-parent). */
  auTitreDe: Habilitation.nullable(),
  motif: z.string(),
});
export type DecisionAcces = z.infer<typeof DecisionAcces>;

export const EntreeAudit = z.object({
  id: z.string(),
  horodatage: z.string(),
  profilId: z.string(),
  profilNom: z.string(),
  action: z.string(),
  ressource: z.string(),
  finalite: Finalite,
  autorise: z.boolean(),
  critereManquant: Critere.nullable(),
});
export type EntreeAudit = z.infer<typeof EntreeAudit>;
