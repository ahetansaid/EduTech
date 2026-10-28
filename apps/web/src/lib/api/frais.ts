"use client";

import { LIBELLE_AGENT_ENCAISSEUR, LIBELLE_TERME_FRAIS, type CouvertureTerme, type DeclarationCadence, type FraisTerme, type LigneFraisEcole, type QualiteAgentEncaisseur, type ReclamationFrais, type SituationFrais, type StatutFrais } from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { ecrire, lire } from "@/lib/http";
import { date } from "@/lib/format";

/**
 * Situation des frais scolaires — côté affichage. Les routes sont dans apps/api/src/frais.ts, les types de
 * vue viennent de @beile/contracts (une seule définition, l'écran et le serveur ne peuvent pas diverger).
 *
 * Rien ici ne calcule une somme : BEILE ne connaît ni montant, ni échéancier chiffré, ni RIB. Ce que l'écran
 * montre, c'est une trace — la référence d'une quittance, une date, la qualité de l'agent qui l'a délivrée —
 * et le fait que l'école a appelé (ou non) un terme à une date donnée. « attendu » ne veut donc pas dire
 * « impayé » : cela veut dire qu'aucune pièce n'est enregistrée pour ce terme à ce jour.
 */

/* ================================================================== Types de réponse */

/** GET /etablissements/:id/frais — état de rapprochement de l'école : des pièces comparées à un effectif. */
export interface EtatFraisEcole {
  etablissement: string;
  etablissementId: string;
  anneeScolaire: string | null;
  /** Date du jour côté serveur (calendrier béninois) : c'est elle qui départage « exigible » et « à venir ». */
  jour: string;
  annees: string[];
  /** La dernière année où l'école ouvre des classes ; en dessous, l'effectif lu n'est plus la promotion de l'année. */
  anneeCourante: string | null;
  /** Termine appliquée à la liste nominative, si l'écran en a demandé une. */
  recherche: string | null;
  cadence: DeclarationCadence | null;
  effectif: number;
  /** Élèves sortis de la liste du jour mais ayant donné lieu à une pièce pour l'année lue. */
  horsEffectif: number;
  totaux: Partial<Record<StatutFrais, number>>;
  parTerme: { terme: FraisTerme; libelle: string; exigibleLe: string; couvertes: number; exonerees: number; attendues: number; aVenir: number }[];
  /** Réclamations déposées par les familles pour les élèves de l'année lue — à instruire depuis cet écran. */
  reclamations: ReclamationFrais[];
  /** Lignes correspondant à la recherche, avant troncature. */
  trouves: number;
  tronque: boolean;
  lignes: LigneFraisEcole[];
}

/** GET /apprenants/:id/frais — la même situation, lue pour un enfant (finalité décidé par l'ABAC). */
export interface FraisApprenant {
  apprenantId: string;
  anneeScolaire: string | null;
  situation: SituationFrais | null;
  reclamations: ReclamationFrais[];
}

export type { CouvertureTerme, DeclarationCadence, LigneFraisEcole, ReclamationFrais, SituationFrais, StatutFrais };
export { LIBELLE_AGENT_ENCAISSEUR, LIBELLE_TERME_FRAIS };
export const TERMES_FRAIS: FraisTerme[] = ["T1", "T2", "T3", "ANNEE"];
export const QUALITES_AGENT: QualiteAgentEncaisseur[] = ["comptable_public", "regisseur_de_recettes", "intendance", "autre"];

/* ================================================================== Libellés honnêtes */

export type TonFrais = "neutre" | "info" | "succes" | "avertissement";

/**
 * Le libellé d'un statut. Aucun ne porte le mot « impayé », aucun n'évoque une somme : ce que le registre
 * sait, c'est si une pièce a été consignée et si l'école a déclaré un appel.
 */
export const LIBELLE_STATUT_FRAIS: Record<StatutFrais, string> = {
  couvert: "Tous les termes appelés ont une pièce",
  exonere: "Exonéré ou pris en charge",
  attendu: "Un terme exigible n'a encore aucune pièce enregistrée",
  en_cours: "Termes en cours d'année",
  sans_declaration: "L'école n'a déclaré aucun appel cette année",
};
export const TON_STATUT_FRAIS: Record<StatutFrais, TonFrais> = {
  couvert: "succes", exonere: "info", attendu: "avertissement", en_cours: "neutre", sans_declaration: "neutre",
};

export const LIBELLE_ETAT_TERME: Record<CouvertureTerme["etat"], string> = {
  paye: "Quittance enregistrée",
  exonere: "Exonération enregistrée",
  attendu: "Exigible, aucune pièce à ce jour",
  a_venir: "Pas encore exigible",
  sans_appel: "Pièce consignée sans appel déclaré",
};
export const TON_ETAT_TERME: Record<CouvertureTerme["etat"], TonFrais> = {
  paye: "succes", exonere: "info", attendu: "avertissement", a_venir: "neutre", sans_appel: "neutre",
};

/* ================================================================== Clés et lectures */

const e = encodeURIComponent;

/** Une seule famille de clés : toute écriture d'un fait de frais invalide `["frais"]`. */
export const clesFrais = {
  tout: ["frais"] as const,
  ecole: (id: string, annee: string | null, recherche: string | null) => ["frais", "etablissement", id, annee ?? "", recherche ?? ""] as const,
  apprenant: (id: string) => ["frais", "apprenant", id] as const,
};

export function useFraisEcole(id: string | null, anneeScolaire?: string | null, recherche?: string | null) {
  return useQuery({
    queryKey: clesFrais.ecole(id ?? "-", anneeScolaire ?? null, recherche?.trim() || null),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (anneeScolaire) params.set("anneeScolaire", anneeScolaire);
      if (recherche?.trim()) params.set("recherche", recherche.trim());
      const url = params.toString();
      return lire<EtatFraisEcole>(`/etablissements/${e(id!)}/frais${url ? `?${url}` : ""}`, signal);
    },
    enabled: !!id,
  });
}

/**
 * Situation des frais d'un élève, lue pour la famille (ou par l'administration de son école). La réponse porte
 * aussi les réclamations déjà déposées et la dernière réponse de l'école : un seul appel, un seul écran.
 */
export function useFraisApprenant(apprenantId: string | null) {
  return useQuery({
    queryKey: clesFrais.apprenant(apprenantId ?? "-"),
    queryFn: ({ signal }) => lire<FraisApprenant>(`/apprenants/${e(apprenantId!)}/frais`, signal),
    enabled: !!apprenantId,
  });
}

/* ================================================================== Écritures */

/**
 * Une clé d'idempotence par FORMULAIRE, pas par clic : générée à l'ouverture (montage du hook), réutilisée pour
 * chaque nouvel essai après une coupure réseau, renouvelée seulement après un succès. Tirée à chaque envoi, elle
 * laissait un nouvel essai inscrire la pièce — et notifier la famille — une seconde fois (audit du 28/10).
 */
function useCleSaisie() {
  const cle = useRef<string | null>(null);
  return {
    valeur: () => (cle.current ??= crypto.randomUUID()),
    renouveler: () => { cle.current = null; },
  };
}

function useInvaliderFrais() {
  const client = useQueryClient();
  return () => {
    client.invalidateQueries({ queryKey: clesFrais.tout });
    client.invalidateQueries({ queryKey: ["famille", "enfants"] });
  };
}

export interface CorpsCadence { anneeScolaire: string; termes: { terme: FraisTerme; exigibleLe: string }[]; cadre: string; referenceDeliberation: string | null }

/** Déclarer l'appel de l'année : des termes et des dates. Une nouvelle déclaration remplace la lecture courante. */
export function useCadenceMutation(id: string) {
  const invalider = useInvaliderFrais();
  const cle = useCleSaisie();
  return useMutation({
    mutationFn: (v: CorpsCadence) => ecrire<{ id: string; etablissement: string; anneeScolaire: string; deja: boolean; remplace?: boolean }>(
      `/etablissements/${e(id)}/frais/cadence`, { ...v, ...(v.referenceDeliberation ? { referenceDeliberation: v.referenceDeliberation } : {}), cle: cle.valeur() }),
    onSuccess: () => { cle.renouveler(); invalider(); },
  });
}

export interface CorpsQuittance { anneeScolaire: string; terme: FraisTerme; delivreeLe: string; referenceQuittance: string; qualiteAgent: QualiteAgentEncaisseur; agent: string | null }

/** Consigner une quittance déjà délivrée. Rien n'est encaissé par BEILE. */
export function useQuittanceMutation(apprenantId: string) {
  const invalider = useInvaliderFrais();
  const cle = useCleSaisie();
  return useMutation({
    mutationFn: (v: CorpsQuittance) => ecrire<{ id: string; apprenantId: string; deja: boolean; alerte?: string | null }>(
      `/apprenants/${e(apprenantId)}/frais/quittance`, { ...v, ...(v.agent ? { agent: v.agent } : {}), cle: cle.valeur() }),
    onSuccess: () => { cle.renouveler(); invalider(); },
  });
}

export interface CorpsExoneration { anneeScolaire: string; terme: FraisTerme | null; nature: "exoneration" | "prise_en_charge"; motif: string; autorite: string; referenceTexte: string; decideLe: string }

/** Enregistrer une exonération ou une prise en charge : un statut légitime, pas une anomalie. La référence de l'acte est exigée. */
export function useExonerationMutation(apprenantId: string) {
  const invalider = useInvaliderFrais();
  const cle = useCleSaisie();
  return useMutation({
    mutationFn: (v: CorpsExoneration) => ecrire<{ id: string; apprenantId: string; deja: boolean }>(
      `/apprenants/${e(apprenantId)}/frais/exoneration`, {
        anneeScolaire: v.anneeScolaire, ...(v.terme ? { terme: v.terme } : {}), nature: v.nature, motif: v.motif,
        autorite: v.autorite, referenceTexte: v.referenceTexte, decideLe: v.decideLe, cle: cle.valeur(),
      }),
    onSuccess: () => { cle.renouveler(); invalider(); },
  });
}

/** Annuler une pièce consignée par erreur : la pièce reste au registre, elle ne compte plus. Motif obligatoire. */
export function useAnnulationMutation(apprenantId: string) {
  const invalider = useInvaliderFrais();
  const cle = useCleSaisie();
  return useMutation({
    mutationFn: (v: { evenementId: string; motif: string }) => ecrire<{ id: string; evenementAnnuleId: string }>(
      `/apprenants/${e(apprenantId)}/frais/annulation`, { ...v, cle: cle.valeur() }),
    onSuccess: () => { cle.renouveler(); invalider(); },
  });
}

export interface CorpsReclamation { anneeScolaire: string; terme: FraisTerme | null; texte: string }

/**
 * Déposer « j'ai payé, rien n'est enregistré ». Le corps ne porte ni somme, ni `cle` : la route refuse une
 * devise dans le texte et une réclamation vivante pour le même élève, la même année et le même terme est
 * rendue telle quelle (`deja: true`) plutôt qu'empilée.
 */
export function useReclamationMutation(apprenantId: string) {
  const invalider = useInvaliderFrais();
  return useMutation({
    mutationFn: (v: CorpsReclamation) => ecrire<{ id: string; echeance?: string; deja?: boolean; statut?: string }>(
      `/apprenants/${e(apprenantId)}/frais/reclamation`, { anneeScolaire: v.anneeScolaire, ...(v.terme ? { terme: v.terme } : {}), texte: v.texte }),
    onSuccess: invalider,
  });
}

/**
 * Réponse de l'école, par le moteur de circuits : `valide` ferme la réclamation (et l'API l'exige — la pièce
 * doit être consignée AVANT), `refuse` la ferme avec un motif écrit. `renvoye` est refusé par la route.
 */
export function useStatuerReclamationMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; decision: "valide" | "refuse"; motif: string }) =>
      ecrire<{ demandeId: string; decision: string; etape: string; statut: string }>(`/demandes/${e(v.id)}/decision`, { decision: v.decision, motif: v.motif }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: clesFrais.tout });
      client.invalidateQueries({ queryKey: ["demandes"] });
    },
  });
}

/* ================================================================== Affichage */

/** La pièce d'un terme, réduite à ce qui est légal à afficher : référence, date, qualité de qui l'a délivrée. */
export const decrireQuittance = (q: NonNullable<CouvertureTerme["quittance"]>) =>
  `Référence ${q.reference} · délivrée le ${date(q.delivreeLe)} par ${q.agent ? q.agent : LIBELLE_AGENT_ENCAISSEUR[q.qualiteAgent].toLowerCase()}`;

export const decrireMesure = (m: NonNullable<CouvertureTerme["mesure"]>) =>
  `${m.nature === "prise_en_charge" ? "Prise en charge" : "Exonération"} — ${m.motif} · décidé par ${m.autorite} le ${date(m.decideLe)}`;

/**
 * Où en est une réclamation, dans les mots du circuit — et dans ceux de la règle 1 : un « en_cours » ne suspend
 * rien, pas plus qu'un « attendu ». Le refus de l'école n'est pas une fin de non-recevoir : il est motivé par
 * écrit, et la famille le lit ici.
 */
export const LIBELLE_STATUT_RECLAMATION: Record<ReclamationFrais["statut"], string> = {
  ouverte: "Déposée, pas encore instruite",
  en_cours: "En cours d'instruction par l'école",
  acceptee: "Reconnue par l'école — la pièce est consignée",
  refusee: "Refusée par l'école, avec motif écrit",
  close: "Close",
};
export const TON_RECLAMATION: Record<ReclamationFrais["statut"], TonFrais> = {
  ouverte: "info", en_cours: "avertissement", acceptee: "succes", refusee: "avertissement", close: "neutre",
};

/** Une ligne, lisible telle quelle par la famille comme par l'école : dépôt, terme visé, dernière réponse. */
export function decrireReclamation(r: ReclamationFrais): string {
  const ou = r.terme ? ` ${LIBELLE_TERME_FRAIS[r.terme]}` : " toute l'année";
  const rendue = r.reponse
    ? `Réponse de l'école le ${date(r.reponse.le)} — ${r.reponse.decision === "valide" ? "pièce reconnue" : "refus, avec motif"}${r.reponse.motif ? ` : ${r.reponse.motif}` : ""}`
    : r.echeance ? `Réponse attendue de l'école avant le ${date(r.echeance)}` : "Réponse attendue de l'école";
  return `Pièce payée non consignée pour${ou} · déposée le ${date(r.deposeeLe)} · ${rendue}`;
}
