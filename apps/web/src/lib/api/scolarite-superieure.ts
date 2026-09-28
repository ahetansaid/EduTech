"use client";

import type {
  AvisConseil, AutoriteEquivalence, ConclusionControle, Composante, ContratPedagogique, DecisionDiplome,
  DeliberationDiplome, Diplome, Equivalence, Groupe, HomologationFiliere, InscriptionSuperieure, Jury, CycleEpes,
  ModeDeliberation, OffreUE, OfficeDeliberant, Periode, PhaseEpes, PorteeRegle,
  RegimePedagogique, RegleCompensation, ReglePonderation, RegleSessionRetenue, RegleValidation, ResultatCapitalisation,
  SessionEvaluation, StatutAccreditation, StatutAgrement, StatutCompte, StatutEquivalence, StatutInscriptionSuperieure,
  StatutInscriptionUE, StatutJury, TypeGroupe, TypeParcours, TypePeriode, TypeUE, UniteEnseignement, Tutelle,
  VoieAcquisition,
} from "@beile/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Ton } from "@/components/ui/primitives";
import { ecrire, lire } from "@/lib/http";

/**
 * Client de la scolarité du supérieur (`apps/api/src/etudiants-superieur.ts`). Les formes reproduisent
 * exactement celles de l'API : un écran qui devinerait un champ en inventerait un.
 *
 * Deux périmètres, deux portes, jamais mélangées : `/etablissements/:id/…` est nominatif et se lit par
 * `accesEtablissement` (chef : écrire ; inspecteur de la circonscription : lire), `/enseignement-superieur/…`
 * n'est qu'un agrégat et se lit par `perimetrePilotage`. Aucun rôle de plus n'est introduit ici.
 */

/* ================================================================== Vocabulaires d'affichage */

export const LIBELLE_REGIME: Record<RegimePedagogique, string> = {
  semestriel: "Semestriel", trimestriel: "Trimestriel", annuel: "Annuel", modulaire: "Modulaire",
};

export const LIBELLE_TYPE_PERIODE: Record<TypePeriode, string> = {
  semestre: "Semestre", trimestre: "Trimestre", annee: "Année", module: "Module",
};

export const LIBELLE_TYPE_UE: Record<TypeUE, string> = {
  obligatoire: "Obligatoire", optionnelle: "Optionnelle", libre: "Libre",
  transversale: "Transversale", stage: "Stage", memoire: "Mémoire",
};

export const LIBELLE_SESSION: Record<SessionEvaluation, string> = {
  normale: "Session normale", rattrapage: "Rattrapage", hors_session: "Hors session",
};

export const LIBELLE_TYPE_GROUPE: Record<TypeGroupe, string> = {
  cm: "Cours magistral", td: "Travaux dirigés", tp: "Travaux pratiques",
  projet: "Projet", clinique: "Stage clinique", atelier: "Atelier",
};

export const LIBELLE_STATUT_INSCRIPTION: Record<StatutInscriptionSuperieure, string> = {
  inscrit: "Inscrit·e", cesure: "En césure", redoublement_partiel: "Redoublant partiel",
  abandon: "Sorti·e (abandon)", transfere_sorti: "Transféré·e", diplome: "Diplômé·e",
};

export const TON_STATUT_INSCRIPTION: Record<StatutInscriptionSuperieure, Ton> = {
  inscrit: "succes", cesure: "neutre", redoublement_partiel: "avertissement",
  abandon: "critique", transfere_sorti: "info", diplome: "marque",
};

export const LIBELLE_STATUT_CONTRAT: Record<StatutInscriptionUE, string> = {
  proposee: "Proposé", signee: "Signé", abandonnee: "Abandonné", validee: "Validé", non_validee: "Non validé",
};

export const TON_STATUT_CONTRAT: Record<StatutInscriptionUE, Ton> = {
  proposee: "info", signee: "succes", abandonnee: "neutre", validee: "marque", non_validee: "critique",
};

export const LIBELLE_PORTEE: Record<PorteeRegle, string> = {
  nationale: "Nationale", etablissement: "Établissement", filiere: "Filière", periode: "Période",
};

export const LIBELLE_COMPENSATION: Record<RegleCompensation, string> = {
  aucune: "Aucune compensation", entre_toutes_les_ue: "Entre toutes les UE", par_bloc: "Par bloc d'UE",
};

export const LIBELLE_PONDERATION: Record<ReglePonderation, string> = {
  ects: "Pondération par crédits ECTS", coefficient: "Pondération par coefficient", ects_puis_coefficient: "Crédits puis coefficients",
};

export const LIBELLE_SESSION_RETENUE: Record<RegleSessionRetenue, string> = {
  meilleure: "La meilleure note est retenue", derniere: "La dernière note est retenue",
};

export const LIBELLE_VOIE_ACQUISITION: Record<VoieAcquisition, string> = {
  note_session: "Note de session", compensation: "Compensation", acquis_anterieur: "Acquis antérieur",
  vae: "VAE", equivalence: "Équivalence", decision_jury: "Décision du jury",
};

export const TON_VOIE_ACQUISITION: Record<VoieAcquisition, Ton> = {
  note_session: "neutre", compensation: "info", acquis_anterieur: "marque",
  vae: "marque", equivalence: "info", decision_jury: "avertissement",
};

export const LIBELLE_STATUT_EQUIVALENCE: Record<StatutEquivalence, string> = {
  demandee: "Demandée", accordee: "Accordée", refusee: "Refusée", retiree: "Retirée",
};

export const TON_STATUT_EQUIVALENCE: Record<StatutEquivalence, Ton> = {
  demandee: "info", accordee: "succes", refusee: "critique", retiree: "neutre",
};

/** Qui statue une équivalence — le mot importe : « nationale » est une direction du MESRS, pas l'établissement. */
export const LIBELLE_AUTORITE_EQUIVALENCE: Record<AutoriteEquivalence, string> = {
  etablissement: "Établissement", nationale: "MESRS (DCE)",
};

export const LIBELLE_STATUT_JURY: Record<StatutJury, string> = {
  constitue: "Constitué", reuni: "Réuni", delibere: "A délibéré", publie: "Publié",
};

export const TON_STATUT_JURY: Record<StatutJury, Ton> = {
  constitue: "neutre", reuni: "info", delibere: "avertissement", publie: "succes",
};

export const LIBELLE_MODE_DELIBERATION: Record<ModeDeliberation, string> = {
  examen_national: "Examen national (autorité de l'État)", jury_capitalisation: "Jury de l'établissement (capitalisation)",
};

export const LIBELLE_OFFICE: Record<OfficeDeliberant, string> = {
  dec_memp: "DEC du MEMP", dec_mestfp: "DEC du MESTFP",
  office_du_bac: "Office du Baccalauréat", dec_sup: "DEC (examens et concours supérieurs)", etablissement: "Établissement",
};

export const LIBELLE_DECISION_DIPLOME: Record<DecisionDiplome, string> = {
  admis: "Admis·e", admis_sous_reserve: "Admis·e sous réserve", ajourne: "Ajourne·e", refuse: "Refusé·e",
};

export const TON_DECISION_DIPLOME: Record<DecisionDiplome, Ton> = {
  admis: "succes", admis_sous_reserve: "avertissement", ajourne: "critique", refuse: "critique",
};

export const LIBELLE_PHASE_EPES: Record<PhaseEpes, string> = {
  creation_sollicitee: "Création sollicitée", autorisation_de_creation: "Autorisation de création",
  autorisation_ouverture: "Autorisation d'ouverture", agrement: "Agrément",
  refuse: "Refusé", suspendu: "Suspendu", retire: "Retiré",
};

export const LIBELLE_STATUT_AGREMENT: Record<StatutAgrement, string> = {
  instruit: "En cours d'instruction", accorde: "Accordé", refuse: "Refusé", suspendu: "Suspendu", retire: "Retiré", expire: "Expiré",
};

export const TON_STATUT_AGREMENT: Record<StatutAgrement, Ton> = {
  instruit: "info", accorde: "succes", refuse: "critique", suspendu: "avertissement", retire: "critique", expire: "avertissement",
};

export const LIBELLE_AVIS_CONSEIL: Record<AvisConseil, string> = {
  favorable: "Avis favorable du conseil", defavorable: "Avis défavorable", non_demande: "Avis non demandé",
};

export const LIBELLE_STATUT_ACCREDITATION: Record<StatutAccreditation, string> = {
  instruite: "En cours d'instruction", accordee: "Homologuée", refusee: "Refusée", suspendue: "Suspendue", retiree: "Retirée", expiree: "Expirée",
};

export const TON_STATUT_ACCREDITATION: Record<StatutAccreditation, Ton> = {
  instruite: "info", accordee: "succes", refusee: "critique", suspendue: "avertissement", retiree: "critique", expiree: "avertissement",
};

export const LIBELLE_CONCLUSION_CONTROLE: Record<ConclusionControle, string> = {
  conforme: "Conforme", reserve: "Avec réserves", non_conforme: "Non conforme", non_controle: "Jamais contrôlé",
};

export const TON_CONCLUSION_CONTROLE: Record<ConclusionControle, Ton> = {
  conforme: "succes", reserve: "avertissement", non_conforme: "critique", non_controle: "neutre",
};

export const LIBELLE_STATUT_ETABLISSEMENT: Record<string, string> = {
  public: "Public", prive: "Privé", confessionnel: "Confessionnel", communautaire: "Communautaire",
};

/* ================================================================== Formes de réponse */

/**
 * Une filière telle que la rend `GET /etablissements/:id/filieres` : la ligne de base, donc
 * `creditsEcts`. Le contrat `Filiere` du catalogue national orthographie ce champ `creditsECTS` — lire
 * l'un avec l'autre rendait un volume de crédits `undefined`, et un diplôme sans volume est une
 * délibération impossible.
 */
export type FiliereEtab = {
  id: string;
  etablissementId: string;
  nom: string;
  domaine: string;
  voie: TypeParcours;
  cycle: "licence" | "master" | "doctorat" | null;
  diplomeVise: Diplome;
  composantes: Composante[];
  creditsEcts: number;
  capaciteAnnuelle: number | null;
  capaciteParComposante: { composante: string; places: number }[];
  serieBacRequise: string[];
  accesConcours: boolean;
  stageObligatoireMois: number;
};

/** Une ligne de la liste des inscriptions : l'API joint la personne et sa filière, sans élargir la porte. */
export type InscriptionEtab = {
  inscription: InscriptionSuperieure;
  apprenant: { id: string; nom: string; prenoms: string };
  filiere: { id: string; nom: string; voie: TypeParcours; diplomeVise: Diplome };
};

export type LigneCatalogueUe = { ue: UniteEnseignement; filiereNom: string };

/** Groupe tel que la porte d'établissement le rend : la période de son offre accompagne la ligne. */
export type GroupeEtab = Groupe & { periodeId: string };

export type LigneDeliberation = {
  deliberation: DeliberationDiplome;
  apprenant: { id: string; nom: string; prenoms: string };
  jury: { autorite: ModeDeliberation; office: OfficeDeliberant | null; president: string; statut: StatutJury };
};

export type HomologationLue = HomologationFiliere & { porte: { operante: boolean; motif: string | null } };

export type StatutAdministratif = {
  etablissement: { id: string; nom: string; statut: string; cycle: string; tutelles: Tutelle[] | null };
  cycles: CycleEpes[];
  homologations: HomologationLue[];
};

/** Ce que la validation d'une période rend : une décision par ligne jugée, avec son motif lisible. */
export interface RenduValidation {
  enregistres: string[];
  reglesAppliquees: string[];
  rendu: { apprenantId: string; code: string; acquise: boolean; voie: VoieAcquisition; justification: string }[];
  deja?: boolean;
}

export interface RenduDeliberation {
  enregistres: string[];
  rendu: {
    apprenantId: string; decision: DecisionDiplome | "non_enregistree"; creditsValides: number;
    moyenneGenerale: number | null; mention: string | null; motif: string;
  }[];
  deja?: boolean;
}

/** Comptages nationaux de la scolarité : aucun établissement nommé, aucune personne listée. */
export interface EffectifsScolarite {
  inscriptions: { statut: StatutInscriptionSuperieure; effectif: number }[];
  validations: { voie: TypeParcours; decisions: number }[];
  homologations: { statut: StatutAccreditation; effectif: number }[];
  jurys: { statut: StatutJury; effectif: number }[];
}

/* ================================================================== Référentiel de l'établissement */

const cle = (id: string, ...suite: (string | null | undefined)[]) => ["scolarite", id, ...suite.map((s) => s ?? "")];
/** Une clé d'idempotence par envoi : rejouer après une réponse perdue ne doit pas inscrire deux fois. */
const saisie = () => crypto.randomUUID();

export const useFilieresEtab = (id: string, actif = true) =>
  useQuery({ queryKey: ["scolarite", id, "filieres"], queryFn: ({ signal }) => lire<FiliereEtab[]>(`/etablissements/${id}/filieres`, signal), enabled: actif });

export function usePeriodes(id: string, filtres: { annee?: string | null; filiereId?: string | null } = {}, actif = true) {
  const params = new URLSearchParams();
  if (filtres.annee) params.set("annee", filtres.annee);
  if (filtres.filiereId) params.set("filiereId", filtres.filiereId);
  const query = params.toString();
  return useQuery({
    queryKey: cle(id, "periodes", filtres.annee, filtres.filiereId),
    queryFn: ({ signal }) => lire<Periode[]>(`/etablissements/${id}/periodes${query ? `?${query}` : ""}`, signal),
    enabled: actif,
  });
}

export const useOffres = (id: string, periodeId: string | null, actif = true) =>
  useQuery({
    queryKey: cle(id, "offres", periodeId),
    queryFn: ({ signal }) => lire<OffreUE[]>(`/etablissements/${id}/offres${periodeId ? `?periodeId=${periodeId}` : ""}`, signal),
    enabled: actif,
  });

export const useCatalogueUe = (id: string, filiereId: string | null, actif = true) =>
  useQuery({
    queryKey: cle(id, "ue", filiereId),
    queryFn: ({ signal }) => lire<LigneCatalogueUe[]>(`/etablissements/${id}/unites-enseignement${filiereId ? `?filiereId=${filiereId}` : ""}`, signal),
    enabled: actif,
  });

/** Un groupe porte la période de son offre : l'écran filtre les groupes d'une période sans recharger un par un. */
export const useGroupes = (id: string, actif = true) =>
  useQuery({
    queryKey: cle(id, "groupes"),
    queryFn: ({ signal }) => lire<GroupeEtab[]>(`/etablissements/${id}/groupes`, signal),
    enabled: actif,
  });

export const useReglesValidation = (id: string, actif = true) =>
  useQuery({ queryKey: cle(id, "regles"), queryFn: ({ signal }) => lire<RegleValidation[]>(`/etablissements/${id}/regles-validation`, signal), enabled: actif });

export const useStatutAdministratif = (id: string, actif = true) =>
  useQuery({ queryKey: cle(id, "statut-administratif"), queryFn: ({ signal }) => lire<StatutAdministratif>(`/etablissements/${id}/statut-administratif`, signal), enabled: actif });

export function useDeclarerPeriodeMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { filiereId: string; composante: Composante | null; type: TypePeriode; numero: number; intitule: string; anneeUniversitaire: string; debut: string | null; fin: string | null; creditsAttendus: number }) =>
      ecrire<Periode>(`/etablissements/${id}/periodes`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "periodes"] }),
  });
}

export function useDeclarerUeMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { filiereId: string; code: string; intitule: string; type: TypeUE; creditsEcts: number; coefficient: number; periodeType: TypePeriode | null; periodeNumero: number | null; prerequis: string[] }) =>
      ecrire<UniteEnseignement>(`/etablissements/${id}/unites-enseignement`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "ue"] }),
  });
}

export function useDeclarerOffreMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { ueId: string; periodeId: string; enseignantId: string | null; session: SessionEvaluation; volumeCm: number; volumeTd: number; volumeTp: number; capacite: number | null }) =>
      ecrire<OffreUE>(`/etablissements/${id}/offres`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "offres"] }),
  });
}

export function useDeclarerGroupeMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { offreUeId: string; type: TypeGroupe; intitule: string; capacite: number; enseignantId: string | null; creneau: string | null }) =>
      ecrire<Groupe>(`/etablissements/${id}/groupes`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "offres"] }),
  });
}

/** Porter une règle de validation : c'est la portée qui décide de la porte (nationale = bureau du supérieur). */
export function useDeclarerRegleMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: ReglePortee) => ecrire<RegleValidation>("/regles-validation", v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "regles"] }),
  });
}

/**
 * La règle nationale ne nomme aucun établissement : elle invalide donc toute la scolarité, puisque
 * chaque fiche de règle d'établissement peut hériter d'elle.
 */
export function useDeclarerRegleNationaleMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: ReglePortee) => ecrire<RegleValidation>("/regles-validation", v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite"] }),
  });
}

/** Les huit paramètres, plus la cible de la portée. `regleId` vide = nouvelle ligne, sinon la même portée est remplacée. */
export interface ReglePortee {
  regleId: string | null;
  portee: PorteeRegle;
  etablissementId: string | null;
  filiereId: string | null;
  periodeId: string | null;
  regime: RegimePedagogique | null;
  seuilAcquisition: number;
  noteEliminatoire: number | null;
  compensation: RegleCompensation;
  ponderation: ReglePonderation;
  sessionRetenue: RegleSessionRetenue;
  seuilMoyennePeriode: number | null;
  dureeValiditeAcquis: number;
  reportCreditsInterEtab: boolean;
  blocs: { code: string; ue: string[] }[];
}

/* ================================================================== Étudiants */

export function useInscriptions(id: string, filtres: { annee?: string | null; filiereId?: string | null } = {}, actif = true) {
  const params = new URLSearchParams();
  if (filtres.annee) params.set("annee", filtres.annee);
  if (filtres.filiereId) params.set("filiereId", filtres.filiereId);
  const query = params.toString();
  return useQuery({
    queryKey: cle(id, "inscriptions", filtres.annee, filtres.filiereId),
    queryFn: ({ signal }) => lire<InscriptionEtab[]>(`/etablissements/${id}/inscriptions${query ? `?${query}` : ""}`, signal),
    enabled: actif,
  });
}

export const useContratEtab = (id: string, apprenantId: string | null) =>
  useQuery({
    queryKey: cle(id, "contrat", apprenantId),
    queryFn: ({ signal }) => lire<ContratPedagogique>(`/etablissements/${id}/contrat/${encodeURIComponent(apprenantId ?? "")}`, signal),
    enabled: !!apprenantId,
  });

/** Décision de la direction sur un contrat proposé : signer, abandonner, ne pas valider. `validee` ne
 *  se pose pas ici — un contrat s'instruit par un acquis, pas par une signature rétroactive. */
export function useDeciderContratMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { inscriptionUeId: string; statut: Exclude<StatutInscriptionUE, "proposee" | "validee">; motifRefus: string | null }) =>
      ecrire<{ inscriptionUeId: string; statut: string }>(`/etablissements/${id}/contrat/ue`, v),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "contrat"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "feuille-validation"] });
    },
  });
}

export function useInscrireMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { apprenantId: string; filiereId: string; composante: Composante | null; anneeUniversitaire: string; regimePedagogique: RegimePedagogique; numeroEtudiant: string | null; statutCompte: StatutCompte }) =>
      ecrire<{ inscriptionId: string; evenementId: string | null }>(`/etablissements/${id}/inscriptions`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "inscriptions"] }),
  });
}

export function useAbandonMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { inscriptionId: string; motif: string | null }) =>
      ecrire<{ inscriptionId: string; statut: string }>(`/etablissements/${id}/inscriptions/${encodeURIComponent(v.inscriptionId)}/abandon`, { motif: v.motif }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "inscriptions"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "credits"] });
    },
  });
}

/**
 * Valider une période : le client ne nomme que les couples (étudiant, offre) à juger. Crédits, moyenne
 * et voie d'acquisition sont décidés par le serveur sous la règle en vigueur — une validation saisie à
 * la main serait un diplôme sans preuve.
 */
export function useValiderPeriodeMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { periodeId: string; lignes: { apprenantId: string; offreUeId: string }[] }) =>
      ecrire<RenduValidation>(`/etablissements/${id}/validations`, { ...v, idSaisie: saisie() }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "contrat"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "credits"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "inscriptions"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "feuille-validation"] });
    },
  });
}

/** La feuille de validation d'une période, avant d'écrire : qui a un contrat, une note, un acquis déjà posé. */
export interface LignePreparatoire {
  apprenantId: string;
  nom: string;
  prenoms: string;
  inscriptionId: string;
  contratId: string;
  contratStatut: StatutInscriptionUE;
  offreUeId: string;
  ueCode: string;
  ueIntitule: string;
  creditsEcts: number;
  notes: number;
  noteMaximale: number | null;
  dejaAcquise: boolean;
}

export const useFeuilleValidation = (id: string, periodeId: string | null) =>
  useQuery({
    queryKey: cle(id, "feuille-validation", periodeId),
    queryFn: ({ signal }) =>
      lire<{ periode: Periode; lignes: LignePreparatoire[] }>(`/etablissements/${id}/validations/preparables?periodeId=${encodeURIComponent(periodeId ?? "")}`, signal),
    enabled: !!periodeId,
  });

export function useAcquisitionHorsNoteMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { apprenantId: string; ueId: string; periodeId: string | null; voie: VoieAcquisition; justification: string }) =>
      ecrire<{ validationId: string; creditsAcquis: number }>(`/etablissements/${id}/validations/hors-note`, v),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "contrat"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "credits"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "feuille-validation"] });
    },
  });
}

export function useTransfertCreditsMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { apprenantId: string; deInscriptionSuperieureId: string; ueIds: string[] }) =>
      ecrire<{ ueIds: string[]; regleAppliquee: string }>(`/etablissements/${id}/transferts-credits`, { ...v, idSaisie: saisie() }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "contrat"] }),
  });
}

/* ================================================================== Capitalisation ECTS (moteur « registre ») */

export const useCreditsEtsEtab = (id: string, annee: string | null, actif = true) =>
  useQuery({
    queryKey: ["scolarite", id, "credits", annee ?? ""],
    queryFn: ({ signal }) => lire<ResultatCapitalisation>(`/etablissements/${id}/scolarite/credits-ects${annee ? `?annee=${annee}` : ""}`, signal),
    enabled: actif,
  });

/** Agrégat national : une ligne par voie, sous le périmètre territorial de l'agent, jamais un établissement nommé. */
export const useCreditsEtsNationaux = (annee: string | null, actif = true) =>
  useQuery({
    queryKey: ["scolarite", "national", "credits", annee ?? ""],
    queryFn: ({ signal }) => lire<ResultatCapitalisation>(`/enseignement-superieur/scolarite/credits-ects${annee ? `?annee=${annee}` : ""}`, signal),
    enabled: actif,
  });

export const useEffectifsScolarite = (actif = true) =>
  useQuery({ queryKey: ["scolarite", "national", "effectifs"], queryFn: ({ signal }) => lire<EffectifsScolarite>("/enseignement-superieur/scolarite/effectifs", signal), enabled: actif });

/* ================================================================== Certification */

export const useJurys = (id: string, actif = true) =>
  useQuery({ queryKey: cle(id, "jurys"), queryFn: ({ signal }) => lire<Jury[]>(`/etablissements/${id}/jurys`, signal), enabled: actif });

export const useDeliberations = (id: string, juryId: string | null, actif = true) =>
  useQuery({
    queryKey: cle(id, "deliberations", juryId),
    queryFn: ({ signal }) => lire<LigneDeliberation[]>(`/etablissements/${id}/deliberations${juryId ? `?juryId=${encodeURIComponent(juryId)}` : ""}`, signal),
    enabled: actif,
  });

export const useEquivalences = (id: string, actif = true) =>
  useQuery({ queryKey: cle(id, "equivalences"), queryFn: ({ signal }) => lire<Equivalence[]>(`/etablissements/${id}/equivalences`, signal), enabled: actif });

export function useConstituerJuryMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: JuryConstitue) =>
      ecrire<{ juryId: string; statut: StatutJury; evenementId: string | null }>(`/etablissements/${id}/jurys`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "jurys"] }),
  });
}

export interface JuryConstitue {
  juryId: string | null;
  autorite: ModeDeliberation;
  office: OfficeDeliberant | null;
  diplome: Diplome;
  periodeId: string | null;
  filiereId: string | null;
  sessionExamenId: string | null;
  statut: StatutJury;
  president: string;
  membres: string[];
  quorum: number;
  pvReference: string | null;
}

/** Le client ne fournit que la décision du jury ; le serveur recalcule crédits validés, moyenne et mention. */
export function useDelibererMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { juryId: string; decisions: { apprenantId: string; decision: DecisionDiplome; ueManquantes: string[] }[] }) =>
      ecrire<RenduDeliberation>(`/etablissements/${id}/deliberations`, { ...v, idSaisie: saisie() }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "deliberations"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "jurys"] });
      client.invalidateQueries({ queryKey: ["scolarite", id, "inscriptions"] });
    },
  });
}

export function useDeposerEquivalenceMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { apprenantId: string; ueId: string; titreOrigine: string; etablissementOrigine: string | null; anneeOrigine: string | null; motif: string }) =>
      ecrire<Equivalence>(`/etablissements/${id}/equivalences`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "equivalences"] }),
  });
}

export function useDecisionEquivalenceMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { equivalenceId: string; statut: StatutEquivalence; autorite: AutoriteEquivalence; motif: string; creditsReconnus: number | null }) =>
      ecrire<Equivalence>(`/etablissements/${id}/equivalences/${encodeURIComponent(v.equivalenceId)}/decision`, {
        statut: v.statut, autorite: v.autorite, motif: v.motif, creditsReconnus: v.creditsReconnus,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "equivalences"] }),
  });
}

/* ================================================================== Actes de l'État sur un établissement */

export function useSuiviEpesMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { autorite: Tutelle; phase: PhaseEpes; statut: StatutAgrement; avisConseil: AvisConseil; acteReference: string | null; accordeLe: string | null; echeanceLe: string | null; renouvellements: number; motif: string | null }) =>
      ecrire<CycleEpes>(`/etablissements/${id}/cycle-epes`, v),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "statut-administratif"] }),
  });
}

export function useHomologuerMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { filiereId: string; diplome: Diplome; statut: StatutAccreditation; quotaAnnuel: number | null; accordeeLe: string | null; echeanceLe: string | null; motif: string | null }) =>
      ecrire<HomologationLue>(`/etablissements/${id}/homologations`, v),
    // Le compte national des homologations est un effet de cet acte : la console le relit.
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["scolarite", id, "statut-administratif"] });
      client.invalidateQueries({ queryKey: ["scolarite", "national"] });
    },
  });
}

export function useControleMutation(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { homologationId: string; conclusion: ConclusionControle; motif: string | null }) =>
      ecrire<HomologationLue>(`/etablissements/${id}/homologations/${encodeURIComponent(v.homologationId)}/controle`, { conclusion: v.conclusion, motif: v.motif }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["scolarite", id, "statut-administratif"] }),
  });
}

/**
 * Réseau des établissements du supérieur, lu sous `perimetrePilotage` : l'agent d'un ministère doit
 * nommer l'établissement sur lequel il statue, sans passer par la porte nominative d'un autre.
 * Une ligne d'annuaire administratif — aucun étudiant, aucune note.
 */
export interface EtablissementSupLu {
  id: string;
  nom: string;
  sigle: string | null;
  typeInstitution: string;
  cycle: string;
  statut: string;
  ministereTutelle: string;
  tutelles: Tutelle[] | null;
  communeId: string;
  circonscription: string;
}

export const useReseauSuperieur = (actif = true) =>
  useQuery({ queryKey: ["scolarite", "reseau"], queryFn: ({ signal }) => lire<EtablissementSupLu[]>("/enseignement-superieur/etablissements", signal), enabled: actif });

/**
 * Catalogue national des filières, sous `perimetrePilotage` : l'agent de l'État doit nommer la filière
 * qu'il homologue sans passer par la porte nominative de l'établissement. La réponse est la ligne de
 * base (`creditsEcts`), pas le contrat `Filiere` (`creditsECTS`).
 */
export const useCatalogueNational = (actif = true) =>
  useQuery({ queryKey: ["scolarite", "catalogue"], queryFn: ({ signal }) => lire<FiliereEtab[]>("/enseignement-superieur/filieres", signal), enabled: actif });
