import { z } from "zod";
import { Matiere, Sexe } from "./referentiels";

/**
 * Trois identités coexistent (document de cadrage §10.3) :
 * - civile      : registre national (NPI), jamais créée ni modifiée par l'éducation ;
 * - éducative   : LEARNER-ID / TEACHER-ID, stable dans le temps ;
 * - de connexion: le compte, qui peut cumuler plusieurs rôles.
 */

/** Fiche du registre national des personnes physiques (simulé). */
export const PersonneRegistre = z.object({
  npi: z.string(),
  nom: z.string(),
  prenoms: z.string(),
  dateNaissance: z.string(),
  sexe: Sexe,
  communeNaissanceId: z.string(),
  parentsNpi: z.array(z.string()),
});
export type PersonneRegistre = z.infer<typeof PersonneRegistre>;

export const StatutIdentite = z.enum(["verifiee", "regularisation_en_cours"]);
export type StatutIdentite = z.infer<typeof StatutIdentite>;

/** LEARNER-ID : identité éducative dérivée, rattachée au NPI quand il existe. */
export const Apprenant = z.object({
  id: z.string(),
  npi: z.string().nullable(),
  statutIdentite: StatutIdentite,
  nom: z.string(),
  prenoms: z.string(),
  dateNaissance: z.string(),
  sexe: Sexe,
  besoinsParticuliers: z.boolean(),
});
export type Apprenant = z.infer<typeof Apprenant>;

/** TEACHER-ID : identité professionnelle, parcours longitudinal. */
export const Enseignant = z.object({
  id: z.string(),
  npi: z.string(),
  nom: z.string(),
  prenoms: z.string(),
  sexe: Sexe,
  matieres: z.array(Matiere),
  etablissementId: z.string(),
  grade: z.string(),
  dateRecrutement: z.string(),
});
export type Enseignant = z.infer<typeof Enseignant>;

/** Lien de filiation ou de tutelle, vérifié au registre national et jamais déclaré librement. */
export const LienFamilial = z.object({
  responsableNpi: z.string(),
  apprenantId: z.string(),
  nature: z.enum(["parent", "tuteur"]),
  verifie: z.boolean(),
});
export type LienFamilial = z.infer<typeof LienFamilial>;
