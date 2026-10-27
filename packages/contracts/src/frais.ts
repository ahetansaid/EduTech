import type { FraisTerme, QualiteAgentEncaisseur } from "./evenements";

/**
 * Situation des frais scolaires : la vue que l'API recalcule à chaque lecture à partir des trois faits de
 * frais du registre (`CADENCE_FRAIS`, `QUITTANCE_FRAIS`, `EXONERATION_FRAIS`). Elle n'est stockée nulle part
 * — rejouer le registre la reconstruit — et ne circule que par les deux lectures qui y ont droit.
 *
 * Aucun montant n'y figure, ni ici ni ailleurs dans BEILE : la somme reste sur la pièce papier et dans la
 * comptabilité de l'établissement. Et un statut se lit, il ne se fait pas obéir : « attendu » ne suspend ni
 * bulletin, ni examen, ni appel, ni l'accès à l'école.
 */

/** Ce qu'un terme appelé par l'école est devenu, à la date de lecture. */
export interface CouvertureTerme {
  terme: FraisTerme;
  /** Date d'exigibilité déclarée par l'école ; null pour une pièce consignée sans appel déclaré. */
  exigibleLe: string | null;
  etat: "paye" | "exonere" | "attendu" | "a_venir" | "sans_appel";
  quittance: { reference: string; delivreeLe: string; qualiteAgent: QualiteAgentEncaisseur; agent: string | null } | null;
  mesure: { nature: "exoneration" | "prise_en_charge"; motif: string; autorite: string; decideLe: string } | null;
}

export type StatutFrais = "couvert" | "exonere" | "attendu" | "en_cours" | "sans_declaration";

/** Déclaration d'appel d'une école pour une année : des termes et des dates, jamais des sommes. */
export interface DeclarationCadence {
  termes: { terme: FraisTerme; exigibleLe: string }[];
  cadre: string;
  referenceDeliberation: string | null;
  declareeLe: string;
}

export interface SituationFrais {
  anneeScolaire: string;
  statut: StatutFrais;
  /** Ce que l'école a appelé pour l'année ; null tant qu'aucune cadence n'est déclarée. */
  cadence: DeclarationCadence | null;
  termes: CouvertureTerme[];
  derniereQuittance: { reference: string; delivreeLe: string; terme: FraisTerme } | null;
}

/** Un apprenant, son année, sa situation : la ligne de l'état de rapprochement vu par l'école. */
export interface LigneFraisEcole {
  apprenantId: string;
  nom: string;
  sexe: "F" | "M";
  classe: string | null;
  /** Ligne d'un apprenant ayant donné lieu à une pièce mais qui n'est plus sur la liste scolarisée du jour. */
  horsEffectif?: boolean;
  statut: StatutFrais;
  termes: CouvertureTerme[];
  derniereQuittance: SituationFrais["derniereQuittance"];
}

/**
 * Réclamation de la famille : « j'ai payé, rien n'est enregistré ». Ce n'est PAS un fait du registre — c'est une
 * demande de circuit (`workflow.demandes`, modèle `RECLAMATION_FRAIS`), déposée par la famille et instruite par
 * l'administration de l'école. Elle ne contient ni somme, ni moyen de paiement, et ne ferme rien par elle-même :
 * ce qui éteint une réclamation, c'est la pièce consignée. La `reponse` est la dernière décision rendue
 * (`workflow.decisions`, ajout seul — l'historique complet reste au détail de la demande).
 */
export interface ReclamationFrais {
  id: string;
  apprenantId: string | null;
  /**
   * Nom porté — ajouté seulement par la lecture de l'école, qui a le droit de nommer ses élèves. La famille,
   * elle, regarde son enfant : sa réponse à elle reste muette sur ce champ.
   */
  nomApprenant?: string | null;
  terme: FraisTerme | null;
  texte: string;
  statut: "ouverte" | "en_cours" | "acceptee" | "refusee" | "close";
  etapeCourante: string;
  deposeeLe: string;
  /** Date limite de réponse de l'école ; `null` si le circuit n'en pose pas. */
  echeance: string | null;
  reponse: { etape: string; decision: "valide" | "refuse" | "renvoye"; motif: string | null; le: string } | null;
}
