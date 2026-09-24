import { z } from "zod";

/** Référentiels nationaux : territoire, établissements, classes, niveaux. */

export const Sexe = z.enum(["F", "M"]);
export type Sexe = z.infer<typeof Sexe>;

export const Milieu = z.enum(["urbain", "rural"]);
export type Milieu = z.infer<typeof Milieu>;

export const StatutEtablissement = z.enum(["public", "prive", "confessionnel"]);
export type StatutEtablissement = z.infer<typeof StatutEtablissement>;

export const Cycle = z.enum(["primaire", "secondaire"]);
export type Cycle = z.infer<typeof Cycle>;

export const NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2", "6e", "5e", "4e", "3e", "2nde", "1re", "Tle"] as const;
export const Niveau = z.enum(NIVEAUX);
export type Niveau = z.infer<typeof Niveau>;

export const MATIERES = ["Mathématiques", "Français", "Anglais", "Sciences physiques", "SVT", "Histoire-Géographie", "Éducation civique"] as const;
export const Matiere = z.enum(MATIERES);
export type Matiere = z.infer<typeof Matiere>;

export const Departement = z.object({
  id: z.string(),
  nom: z.string(),
  chefLieu: z.string(),
});
export type Departement = z.infer<typeof Departement>;

export const Commune = z.object({
  id: z.string(),
  nom: z.string(),
  departementId: z.string(),
  milieu: Milieu,
});
export type Commune = z.infer<typeof Commune>;

export const Infrastructures = z.object({
  eau: z.boolean(),
  electricite: z.boolean(),
  internet: z.boolean(),
  latrines: z.boolean(),
  bibliotheque: z.boolean(),
});
export type Infrastructures = z.infer<typeof Infrastructures>;

/** SCHOOL-ID : identifiant d'établissement stable et géolocalisé. */
export const Etablissement = z.object({
  id: z.string(),
  nom: z.string(),
  cycle: Cycle,
  statut: StatutEtablissement,
  communeId: z.string(),
  circonscription: z.string(),
  lat: z.number(),
  lng: z.number(),
  capacite: z.number().int(),
  sallesDeClasse: z.number().int(),
  infrastructures: Infrastructures,
});
export type Etablissement = z.infer<typeof Etablissement>;

/** CLASS-ID : rattachement pédagogique daté (une classe par année scolaire). */
export const Classe = z.object({
  id: z.string(),
  etablissementId: z.string(),
  niveau: Niveau,
  libelle: z.string(),
  anneeScolaire: z.string(),
  capacite: z.number().int(),
  enseignantPrincipalId: z.string().nullable(),
});
export type Classe = z.infer<typeof Classe>;
