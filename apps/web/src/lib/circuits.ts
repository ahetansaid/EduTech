/**
 * Circuits de workflow : libellés partagés (espace établissement, file « demandes à traiter »).
 * Aucune logique d'accès ici — le droit d'agir est décidé par l'API (rôle de l'étape + périmètre).
 */

export interface EtapeCircuit { ordre: number; code: string; role: string; delaiJours: number }

export const ETAPES_ACCOMPAGNEMENT = [
  { code: "PROPOSITION", libelle: "Proposition" },
  { code: "VALIDATION_CONSEIL", libelle: "Validation pédagogique" },
  { code: "INFORMATION_FAMILLES", libelle: "Information des familles" },
] as const;

export const ETAPES_RELANCE = [
  { code: "RELANCE", libelle: "Relance" },
  { code: "TRANSMISSION", libelle: "Transmission" },
] as const;

export const ETAPES_DROITS = [
  { code: "DEPOT", libelle: "Dépôt par la personne" },
  { code: "INSTRUCTION", libelle: "Instruction et réponse" },
] as const;

/** Droits exerçables et leur libellé (circuit DROITS). */
export const LIBELLE_DROIT: Record<string, string> = {
  acces: "Accès à mes données",
  rectification: "Rectification d'une donnée",
  limitation: "Limitation d'un traitement",
  opposition: "Opposition à un traitement",
};

export const CIRCUIT_LIBELLE: Record<string, string> = {
  DROITS: "Exercice des droits sur les données",
  ACCOMPAGNEMENT: "Accompagnement pédagogique",
  RELANCE_TRANSMISSION: "Relance de transmission",
  TRANSFERT: "Transfert d'établissement",
  RECLAMATION: "Réclamation sur une donnée",
  AFFECTATION: "Affectation d'un enseignant",
};

export const LIBELLE_ROLE_CIRCUIT: Record<string, string> = {
  chef_etablissement: "chef d'établissement",
  inspecteur: "inspecteur de la circonscription",
  direction_departementale: "direction départementale",
  administration_centrale: "administration centrale",
  parent: "responsable légal",
  apprenant: "apprenant",
  enseignant: "enseignant",
  dpo: "délégué à la protection des données",
  demandeur: "personne concernée",
};

/** Étapes libellées d'un circuit connu (liste vide sinon : l'affichage se replie sur le code brut). */
export function etapesDuCircuit(code: string): { code: string; libelle: string }[] {
  if (code === "ACCOMPAGNEMENT") return [...ETAPES_ACCOMPAGNEMENT];
  if (code === "RELANCE_TRANSMISSION") return [...ETAPES_RELANCE];
  if (code === "DROITS") return [...ETAPES_DROITS];
  return [];
}

export function libelleEtape(codeCircuit: string, codeEtape: string): string {
  return etapesDuCircuit(codeCircuit).find((e) => e.code === codeEtape)?.libelle ?? codeEtape;
}
