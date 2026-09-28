import { z } from "zod";
import { Composante, Diplome, TypeParcours, Tutelle } from "./enseignement-superieur";
import { Mention } from "./referentiels";

/**
 * Gestion des étudiants du supérieur — formes du contrat pédagogique LMD/EFTP.
 *
 * Doctrine : BEILE n'est pas un logiciel de scolarité d'université. Il tient l'IDENTITÉ de la
 * personne (apprenant), la CERTIFICATION du diplôme national, et l'AGRÉGATION qui permet au
 * MESRS/MESTFP de piloter. La vie étudiante (logement, santé) et la comptabilité publique (frais,
 * bourses en montants) restent hors périmètre. Depuis le 2026-09-28, deux volets entrent dans ce
 * périmètre côté PREUVE seulement : la délivrance des actes (`delivrance-actes.ts`, délais datés et
 * imputables) et le statut d'allocataire d'une bourse (statut, autorité, référence d'arrêté, période —
 * jamais un montant ni un RIB).
 *
 * Principe de liberté : on ne contraint pas un établissement au standard, on lui permet de s'y
 * adapter. Chaque établissement choisit son régime (semestriel, trimestriel, annuel, modulaire)
 * et règle sa validation dans un VOCABULAIRE FERMÉ (`RegleValidation`) — jamais un JSON libre,
 * jamais une branche de code par cas. La liberté porte sur les paramètres, pas sur la structure :
 * c'est ce qui permet à deux établissements différents d'être comparés au niveau national.
 *
 * Quatre niveaux, et non trois :
 *   1. promotion       — cohorte administrative (InscriptionSuperieure, une ligne par année) ;
 *   2. offre d'UE      — une UE réellement enseignée dans une période (OffreUE) ;
 *   3. groupe          — instance TD/TP/projet d'une offre (Groupe) ;
 *   4. contrat         — ce que l'étudiant a signé et ce qu'il a acquis (InscriptionUE + ValidationUE).
 * Un groupe n'est pas une entité libre : c'est une occurrence d'une offre dans une période.
 *
 * L'unité de compte n'est pas la note mais le crédit ECTS. La validation est séparée de la note :
 * sinon on ne peut jamais répondre à « pourquoi cette UE est-elle acquise ? ». Un crédit acquis
 * est définitif et transférable — le recalculer à chaque lecture serait une régression.
 */

/* ================================================================== Régime et périodes */

/**
 * Rythme choisi par l'établissement. Le semestre ET le trimestre coexistent : aucun des deux n'est la
 * norme imposée. Ce choix est porté par l'inscription, pas par une colonne `semestre`.
 *
 * Honnêteté sur les sources : les rythmes semestriel, trimestriel et annuel sont ceux du LMD tel que
 * le Bénin l'applique. `modulaire` n'est attesté par AUCUN texte que j'aie pu vérifier — il est là
 * pour un régime de formation continue à capitaliser, et doit rester inutilisé tant qu'aucun arrêté
 * ne le nomme.
 */
export const RegimePedagogique = z.enum(["semestriel", "trimestriel", "annuel", "modulaire"]);
export type RegimePedagogique = z.infer<typeof RegimePedagogique>;

/** Nature d'une période. Aucune période n'est privilégiée dans le modèle : `type` + `numero`. */
export const TypePeriode = z.enum(["semestre", "trimestre", "annee", "module"]);
export type TypePeriode = z.infer<typeof TypePeriode>;

/**
 * Période générique d'une filière. Jamais de colonne `semestre` : un S1 est `{type:"semestre",
 * numero:1}`, un T2 est `{type:"trimestre", numero:2}`. Ajouter un rythme ne demande ni
 * migration ni branche conditionnelle.
 */
export const Periode = z.object({
  id: z.string(),
  filiereId: z.string(),
  /**
   * Année d'étude à laquelle la période s'applique : une filière LMD déroule un S1 en L1 ET un S1 en
   * L2 la même année — sans ce champ, les deux porteraient le même nom. null pour une filière EFTP
   * hors LMD, dont une année universitaire ne déroule qu'une seule cohorte.
   */
  composante: Composante.nullable(),
  type: TypePeriode,
  /** Rang de la période dans l'année universitaire. */
  numero: z.number().int().min(1),
  intitule: z.string(),
  /** AAAA-AAAA. */
  anneeUniversitaire: z.string(),
  debut: z.string().nullable(),
  fin: z.string().nullable(),
  /** Crédits que la période permet de capitaliser (30 pour un semestre LMD standard). */
  creditsAttendus: z.number().int().nonnegative(),
});
export type Periode = z.infer<typeof Periode>;

/* ================================================================== Inscription (promotion) */

export const StatutInscriptionSuperieure = z.enum([
  "inscrit", "cesure", "redoublement_partiel", "abandon", "transfere_sorti", "diplome",
]);
export type StatutInscriptionSuperieure = z.infer<typeof StatutInscriptionSuperieure>;

/**
 * Statut de compte de l'inscription, tel que le MESRS le compte dans ses effectifs. Le vocabulaire a
 * été élargi le 2026-09-28 aux formes que le mécanisme réel connaît : la demi-bourse (le MESRS décrit
 * une échelle bourse entière → demi-bourse → payant, ask.gouv.bj n°7) et le secours universitaire
 * (quota distinct, avec repêchage de non-boursiers au semestre 3). Les fondre dans un seul « boursier »
 * fausserait le décompte national. `non_precise` reste : un effectif dont le statut n'est pas déclaré
 * demeure un effectif, et l'afficher vaut mieux qu'un faux « payant ».
 *
 * Limite stricte, redite dans `delivrance-actes.ts` : BEILE tient ce statut comme un **fait certifié**
 * (statut + autorité + référence d'arrêté + période), jamais comme une comptabilité. Aucun montant,
 * aucun échéancier, aucun RIB en base — la liquidation reste à la DBAU et au Trésor public.
 */
export const StatutCompte = z.enum([
  "boursier_integral", "demi_boursier", "secours", "payant", "non_precise",
]);
export type StatutCompte = z.infer<typeof StatutCompte>;

/**
 * Une inscription supérieure = une personne dans une filière pour une année universitaire.
 * PLUSIEURS lignes par apprenant (contrairement à `core.scolarites` dont la clé primaire est
 * l'apprenant) : c'est la condition d'un transfert, d'une césure ou d'une réorientation.
 * « Étudiant » n'est pas une personne de plus — c'est ce statut d'inscription.
 */
export const InscriptionSuperieure = z.object({
  id: z.string(),
  apprenantId: z.string(),
  etablissementId: z.string(),
  filiereId: z.string(),
  /** null pour une filière EFTP hors LMD (CAP, BT, BTS, CQP). */
  composante: Composante.nullable(),
  /** AAAA-AAAA. */
  anneeUniversitaire: z.string(),
  /** Le régime de l'établissement, tel qu'il l'a déclaré : la liberté est un fait, pas une option. */
  regimePedagogique: RegimePedagogique,
  numeroEtudiant: z.string().nullable(),
  statut: StatutInscriptionSuperieure,
  /** Dimension de comptage national ; jamais un module de bourses. */
  statutCompte: StatutCompte.default("non_precise"),
  /**
   * L'année n'est pas un bloc : en redoublement partiel on ne repasse que les UE non acquises.
   * Vide hors redoublement partiel.
   */
  ueNonAcquises: z.array(z.string()),
  creditsAcquisCumules: z.number().int().nonnegative(),
  inscriteLe: z.string(),
});
export type InscriptionSuperieure = z.infer<typeof InscriptionSuperieure>;

/* ================================================================== UE, offre, groupe */

export const TypeUE = z.enum(["obligatoire", "optionnelle", "libre", "transversale", "stage", "memoire"]);
export type TypeUE = z.infer<typeof TypeUE>;

/** UE du catalogue d'une filière : la brique de connaissance, indépendamment de toute session. */
export const UniteEnseignement = z.object({
  id: z.string(),
  filiereId: z.string(),
  code: z.string(),
  intitule: z.string(),
  type: TypeUE,
  creditsEcts: z.number().int().positive(),
  /** Utilisé seulement si la règle de validation pondère par coefficient. */
  coefficient: z.number().positive(),
  /** Période-type où l'UE est normalement suivie ; null = au choix de l'étudiant (mineure, réorientation). */
  periodeType: TypePeriode.nullable(),
  periodeNumero: z.number().int().min(1).nullable(),
  /** Codes d'UE prérequises : un contrat peut être refusé si elles ne sont pas acquises. */
  prerequis: z.array(z.string()),
});
export type UniteEnseignement = z.infer<typeof UniteEnseignement>;

/** Session d'évaluation d'une offre : la normale puis le rattrapage, jamais une troisième voie. */
export const SessionEvaluation = z.enum(["normale", "rattrapage", "hors_session"]);
export type SessionEvaluation = z.infer<typeof SessionEvaluation>;

/** Occurrence réelle d'une UE dans une période donnée, avec ses volumes horaires. */
export const OffreUE = z.object({
  id: z.string(),
  ueId: z.string(),
  periodeId: z.string(),
  etablissementId: z.string(),
  enseignantId: z.string().nullable(),
  session: SessionEvaluation,
  volumeCm: z.number().int().nonnegative(),
  volumeTd: z.number().int().nonnegative(),
  volumeTp: z.number().int().nonnegative(),
  /** Places offertes ; null = sans limite déclarée (jamais une capacité inventée). */
  capacite: z.number().int().nonnegative().nullable(),
});
export type OffreUE = z.infer<typeof OffreUE>;

export const TypeGroupe = z.enum(["cm", "td", "tp", "projet", "clinique", "atelier"]);
export type TypeGroupe = z.infer<typeof TypeGroupe>;

/** Groupe de TD/TP : une instance d'une offre, pas une entité autonome. */
export const Groupe = z.object({
  id: z.string(),
  offreUeId: z.string(),
  type: TypeGroupe,
  intitule: z.string(),
  capacite: z.number().int().positive(),
  enseignantId: z.string().nullable(),
  /** Créneau déclaré, pour détecter les chevauchements du contrat d'un étudiant ; null si inconnu. */
  creneau: z.string().nullable(),
});
export type Groupe = z.infer<typeof Groupe>;

/* ================================================================== Contrat pédagogique */

export const StatutInscriptionUE = z.enum(["proposee", "signee", "abandonnee", "validee", "non_validee"]);
export type StatutInscriptionUE = z.infer<typeof StatutInscriptionUE>;

/**
 * Le contrat réel : l'étudiant choisit ses UE. Daté, parce qu'un parcours sans date de signature
 * n'est pas auditable. Un refus de contrat porte un motif (prérequis, chevauchement, capacité).
 */
export const InscriptionUE = z.object({
  id: z.string(),
  inscriptionSuperieureId: z.string(),
  apprenantId: z.string(),
  offreUeId: z.string(),
  /** Groupe retenu ; null pour une UE sans groupe. */
  groupeId: z.string().nullable(),
  statut: StatutInscriptionUE,
  signeeLe: z.string().nullable(),
  motifRefus: z.string().nullable(),
});
export type InscriptionUE = z.infer<typeof InscriptionUE>;

/* ================================================================== Règle de validation (vocabulaire fermé) */

/**
 * Les HUIT paramètres de décision d'une validation. Toute la liberté d'un établissement tient
 * dans ces huit curseurs ; rien d'autre n'est paramétrable.
 *
 * Précédence : `nationale` < `etablissement` < `filiere` < `periode`. La ligne la plus précise
 * l'emporte EN BLOC, et non paramètre par paramètre : toute colonne portant un défaut, rien ne
 * distingue en base « hérité » de « déclaré à la valeur par défaut ». Fusionner deux lignes
 * produirait une règle que l'on ne peut plus montrer à l'étudiant ; la règle appliquée est donc
 * UNIQUE et enregistrée sous `regleValidationId`. Un établissement qui ne déclare rien hérite de la
 * règle nationale — il n'est jamais bloqué par l'absence de saisie.
 */
export const PorteeRegle = z.enum(["nationale", "etablissement", "filiere", "periode"]);
export type PorteeRegle = z.infer<typeof PorteeRegle>;

export const RegleCompensation = z.enum(["aucune", "entre_toutes_les_ue", "par_bloc"]);
export type RegleCompensation = z.infer<typeof RegleCompensation>;

export const ReglePonderation = z.enum(["ects", "coefficient", "ects_puis_coefficient"]);
export type ReglePonderation = z.infer<typeof ReglePonderation>;

export const RegleSessionRetenue = z.enum(["meilleure", "derniere"]);
export type RegleSessionRetenue = z.infer<typeof RegleSessionRetenue>;

export const RegleValidation = z.object({
  id: z.string(),
  portee: PorteeRegle,
  etablissementId: z.string().nullable(),
  filiereId: z.string().nullable(),
  /** Portée `periode` : la période visée. Sans cette clé, une règle « de période » ne dirait rien de plus qu'une règle de filière. */
  periodeId: z.string().nullable(),
  /** null = tous les régimes de la portée. */
  regime: RegimePedagogique.nullable(),
  /** 1. Seuil d'acquisition d'une UE, sur 20. */
  seuilAcquisition: z.number().min(0).max(20).default(10),
  /** 2. Note éliminatoire : sous ce seuil, aucune compensation ne rachète l'UE. null = aucune. */
  noteEliminatoire: z.number().min(0).max(20).nullable().default(null),
  /** 3. Périmètre de la compensation entre UE. */
  compensation: RegleCompensation.default("par_bloc"),
  /** 4. Pondération de la moyenne. */
  ponderation: ReglePonderation.default("ects"),
  /** 5. Note retenue quand une UE est repassée. */
  sessionRetenue: RegleSessionRetenue.default("meilleure"),
  /** 6. Moyenne minimale de période ouvrant la compensation ; null = aucune condition de moyenne. */
  seuilMoyennePeriode: z.number().min(0).max(20).nullable().default(null),
  /** 7. Durée de validité d'un acquis, en années. Au-delà, l'acquis doit être revalidé. */
  dureeValiditeAcquis: z.number().int().min(0).max(20).default(5),
  /** 8. Report des crédits acquis vers une autre filière homologuée. */
  reportCreditsInterEtab: z.boolean().default(true),
  /**
   * Matérialisation du paramètre 3 quand `compensation = "par_bloc"` : des listes de codes d'UE.
   * Ce n'est pas un neuvième axe de liberté, c'est la forme du troisième.
   */
  blocs: z.array(z.object({ code: z.string(), ue: z.array(z.string()).min(1) }).strict()).default([]),
});
export type RegleValidation = z.infer<typeof RegleValidation>;

/* ================================================================== Validation (crédit acquis) */

/**
 * Les voies d'acquisition d'une UE. Trois voies principales (note, compensation, acquis antérieur)
 * plus la VAE, l'équivalence et la décision de jury — toutes auditablement distinctes.
 */
export const VoieAcquisition = z.enum([
  "note_session", "compensation", "acquis_anterieur", "vae", "equivalence", "decision_jury",
]);
export type VoieAcquisition = z.infer<typeof VoieAcquisition>;

/** Voies qui ne produisent aucune note : la justification y est obligatoire. */
export const VOIES_SANS_NOTE: readonly VoieAcquisition[] = ["acquis_anterieur", "vae", "equivalence", "decision_jury"];

export const ValidationUE = z.object({
  id: z.string(),
  apprenantId: z.string(),
  ueId: z.string(),
  /** null quand l'acquisition ne provient d'aucune offre (VAE, équivalence, acquis antérieur). */
  offreUeId: z.string().nullable(),
  periodeId: z.string().nullable(),
  etablissementId: z.string(),
  voie: VoieAcquisition,
  /** Crédits capitalisés = ceux de l'UE. Une UE s'acquiert en bloc, jamais au prorata. */
  creditsAcquis: z.number().int().positive(),
  moyenne: z.number().min(0).max(20).nullable(),
  session: SessionEvaluation.default("hors_session"),
  regleValidationId: z.string(),
  /** Réponse à « pourquoi cette UE est-elle acquise ? ». */
  justification: z.string(),
  acquiseLe: z.string(),
  /** Un crédit acquis est définitif et transférable : il n'est jamais recalculé. */
  definitive: z.boolean(),
  /** Fait du registre à l'origine de l'acquisition : la chaîne de preuve. */
  evenementId: z.string().nullable(),
}).refine(
  (v) => !VOIES_SANS_NOTE.includes(v.voie) || v.justification.trim().length >= 5,
  { message: "Une acquisition hors note de session doit être justifiée (5 caractères au moins)." },
);
export type ValidationUE = z.infer<typeof ValidationUE>;

/* ================================================================== Équivalences */

export const StatutEquivalence = z.enum(["demandee", "accordee", "refusee", "retiree"]);
export type StatutEquivalence = z.infer<typeof StatutEquivalence>;

/**
 * Qui statue. Au Bénin, l'équivalence des diplômes n'est pas qu'affaire d'établissement : une
 * direction du MESRS en porte la charge — « DCE : Direction du Contrôle et des Équivalences des
 * Diplômes ». Un établissement ne peut donc pas s'auto-attribuer la reconnaissance d'un acquis.
 */
export const AutoriteEquivalence = z.enum(["etablissement", "nationale"]);
export type AutoriteEquivalence = z.infer<typeof AutoriteEquivalence>;

/** Reconnaissance d'un acquis antérieur : la passerelle CQP/BTS → licence pro en dépend. */
export const Equivalence = z.object({
  id: z.string(),
  apprenantId: z.string(),
  etablissementId: z.string(),
  ueId: z.string(),
  titreOrigine: z.string(),
  etablissementOrigine: z.string().nullable(),
  anneeOrigine: z.string().nullable(),
  creditsReconnus: z.number().int().nonnegative(),
  statut: StatutEquivalence,
  autorite: AutoriteEquivalence.default("etablissement"),
  motif: z.string(),
  decidePar: z.string().nullable(),
  decideLe: z.string().nullable(),
}).refine(
  (e) => e.statut === "demandee" || e.statut === "retiree" || e.decidePar !== null,
  { message: "Une équivalence statuée doit indiquer son autorité de décision." },
);
export type Equivalence = z.infer<typeof Equivalence>;

/* ================================================================== Cycle d'un établissement privé et homologation d'une filière */

export const StatutAgrement = z.enum(["instruit", "accorde", "refuse", "suspendu", "retire", "expire"]);
export type StatutAgrement = z.infer<typeof StatutAgrement>;

/**
 * Cycle officiel d'un établissement privé d'enseignement supérieur (EPES), tel que le catalogue des
 * services publics de l'État le décrit lui-même : le promoteur obtient une **autorisation de
 * création**, puis une **autorisation d'ouverture** délivrée par arrêté du ministre *après avis du
 * Conseil Consultatif National de l'Enseignement Supérieur*, valable **deux ans et renouvelable une
 * fois**, « après quoi il faudra passer à l'agrément ». Un seul booléen « privé = agréé » serait faux :
 * selon l'étape du cycle, l'établissement n'a pas le même droit d'inscrire des étudiants.
 * Décret 2008-818 du 31 décembre 2008 ; arrêté 2014 n°350/MESRS/CAB/DC/SGM/DGES/DEPES/SA.
 */
export const PhaseEpes = z.enum([
  "creation_sollicitee", "autorisation_de_creation", "autorisation_ouverture", "agrement",
  "refuse", "suspendu", "retire",
]);
export type PhaseEpes = z.infer<typeof PhaseEpes>;

/** Deux ans, renouvelables une fois : ce sont les nombres énoncés par la fiche du service public. */
export const DUREE_AUTORISATION_OUVERTURE_ANS = 2;
export const RENOUVELLEMENTS_AUTORISATION_OUVERTURE_MAX = 1;

/** Avis de l'instance consultative : obligatoire pour autoriser l'ouverture, jamais implicite. */
export const AvisConseil = z.enum(["favorable", "defavorable", "non_demande"]);
export type AvisConseil = z.infer<typeof AvisConseil>;

export const CycleEpes = z.object({
  id: z.string(),
  etablissementId: z.string(),
  /** Un EPES peut relever de deux tutelles : une ligne par autorité. */
  autorite: Tutelle,
  phase: PhaseEpes,
  /** À `instruit` correspond une demande en cours ; les autres statuts qualifient la phase courante. */
  statut: StatutAgrement,
  avisConseil: AvisConseil.default("non_demande"),
  /** Référence de l'acte (arrêté), telle qu'elle doit pouvoir être opposée à un tiers. */
  acteReference: z.string().nullable(),
  accordeLe: z.string().nullable(),
  echeanceLe: z.string().nullable(),
  renouvellements: z.number().int().nonnegative(),
  motif: z.string().nullable(),
}).refine(
  (a) => a.phase !== "autorisation_ouverture" || a.avisConseil === "favorable",
  { message: "Une autorisation d'ouverture d'EPES suppose un avis favorable du conseil consultatif." },
).refine(
  (a) => a.phase !== "autorisation_ouverture" || a.renouvellements <= RENOUVELLEMENTS_AUTORISATION_OUVERTURE_MAX,
  { message: "L'autorisation d'ouverture n'est renouvelable qu'une fois, avant l'agrément." },
);
export type CycleEpes = z.infer<typeof CycleEpes>;

export const StatutAccreditation = z.enum(["instruite", "accordee", "refusee", "suspendue", "retiree", "expiree"]);
export type StatutAccreditation = z.infer<typeof StatutAccreditation>;

export const ConclusionControle = z.enum(["conforme", "reserve", "non_conforme", "non_controle"]);
export type ConclusionControle = z.infer<typeof ConclusionControle>;

/**
 * Homologation d'un couple (établissement, filière) à délivrer un diplôme national. Le terme
 * officiel béninois est l'**homologation** des filières (décret n° 2020-551 relatif aux filières de
 * formation non homologuées), distinct de l'agrément de l'établissement : une école agréée peut
 * ouvrir une filière qui ne l'est pas. C'est le principal contrôle anti-fraude — sans homologation
 * en cours, le diplôme délivré n'est pas opposable et BEILE ne doit pas le certifier.
 */
export const HomologationFiliere = z.object({
  id: z.string(),
  etablissementId: z.string(),
  filiereId: z.string(),
  diplome: Diplome,
  statut: StatutAccreditation,
  /** Plafond d'inscriptions annuelles ; null = aucun plafond déclaré. */
  quotaAnnuel: z.number().int().nonnegative().nullable(),
  accordeeLe: z.string().nullable(),
  echeanceLe: z.string().nullable(),
  dernierControleLe: z.string().nullable(),
  conclusionControle: ConclusionControle.default("non_controle"),
  motif: z.string().nullable(),
});
export type HomologationFiliere = z.infer<typeof HomologationFiliere>;

/**
 * Porte de certification : BEILE ne certifie pas un diplôme national porté par une filière dont
 * l'homologation n'est pas en cours. Fonction pure sur la FORME — aucune donnée d'étudiant, aucun
 * accès au registre, aucune valeur inventée.
 */
export function homologationOperante(
  a: Pick<HomologationFiliere, "statut" | "echeanceLe" | "conclusionControle">,
  aujourdhuiIso: string,
): { operante: boolean; motif: string | null } {
  if (a.statut !== "accordee") return { operante: false, motif: `Homologation ${a.statut}.` };
  if (a.echeanceLe && a.echeanceLe < aujourdhuiIso) return { operante: false, motif: "Homologation échue." };
  if (a.conclusionControle === "non_conforme") return { operante: false, motif: "Contrôle pédagogique non conforme." };
  if (a.conclusionControle === "non_controle") {
    return { operante: true, motif: "Homologation en cours, sans contrôle pédagogique enregistré." };
  }
  return { operante: true, motif: null };
}

/* ================================================================== Deux autorités de délibération, une seule certification */

/**
 * Un même diplôme peut relever des DEUX autorités. Vérifié au Bénin, pas supposé : la Direction des
 * Examens et Concours Supérieurs (DEC — decsup.bj, MESRS) organise des examens nationaux AU-DESSUS du
 * baccalauréat ; l'annuaire statistique du ministère consacre une section « Données sur les examens
 * nationaux : le BTS » et le portail des services publics décrit une démarche « Diplôme de licence des
 * examens nationaux ». Une université publique délibère donc sur capitalisation de crédits ; l'État
 * certifie par examen national les candidats des établissements que rien n'habilite à délibérer
 * eux-mêmes. Un mode unique par diplôme serait une erreur de modèle, pas une simplification.
 */
export const ModeDeliberation = z.enum(["examen_national", "jury_capitalisation"]);
export type ModeDeliberation = z.infer<typeof ModeDeliberation>;

/**
 * Modes ouverts à un diplôme. Seuls `CAP`, `BTS`, `CQP`, `BT`, `BEP`, `BAC` et la `LICENCE`/`MASTER`
 * (via la préinscription aux examens nationaux) sont attestés par une source béninoise ; les autres
 * extensions sont par analogie avec la filière dont elles relèvent, et restent à confirmer par arrêté.
 */
export const MODES_CERTIFICATION: Readonly<Record<Diplome, readonly ModeDeliberation[]>> = {
  CAP: ["examen_national"],
  BEP: ["examen_national"],
  BAC: ["examen_national"],
  BAC_TECHNIQUE: ["examen_national"],
  BT: ["examen_national"],
  BTS: ["examen_national"],
  CQP: ["examen_national"],
  LICENCE: ["jury_capitalisation", "examen_national"],
  LICENCE_PRO: ["jury_capitalisation", "examen_national"],
  MASTER: ["jury_capitalisation", "examen_national"],
  MASTER_PRO: ["jury_capitalisation", "examen_national"],
  DOCTORAT: ["jury_capitalisation"],
  DES: ["jury_capitalisation", "examen_national"],
};

export const modesCertificationDe = (diplome: Diplome): readonly ModeDeliberation[] => MODES_CERTIFICATION[diplome];
export const modeCertifiable = (diplome: Diplome, mode: ModeDeliberation) => MODES_CERTIFICATION[diplome].includes(mode);

/**
 * Étages de diplômes tels que la DPP/MESRS les compte dans ses effectifs étudiants (annuaire
 * statistique de l'enseignement supérieur : « Répartition des étudiants … selon le diplôme »).
 * BEILE ne réinvente pas l'échelle nationale, il la reproduit — y compris sa modalité « non précisé »,
 * parce qu'un effectif dont le diplôme n'est pas déclaré reste un effectif comptable.
 */
export const EtageDiplome = z.enum([
  "doctorat_des", "master_dea_dess", "expertise", "ingenieur_maitrise_mst",
  "capet_capes_licence", "licence_bachelor", "bts_dts_due", "autre", "non_precise",
]);
export type EtageDiplome = z.infer<typeof EtageDiplome>;

/** Libellés exacts de la colonne nationale, conservés tels quels pour ne pas perdre la trace. */
export const ETAGE_DIPLOME_MESRS: Readonly<Record<EtageDiplome, string>> = {
  doctorat_des: "DOCTORAT / PhD / DES",
  master_dea_dess: "DEA / DESS / MASTER",
  expertise: "EXPERTISE / COMPTABLE",
  ingenieur_maitrise_mst: "INGENIEUR / MAITRISE / MST",
  capet_capes_licence: "CF / DEC / CAPES / CAPET / CAP EME",
  licence_bachelor: "BACHELOR / LICENCE",
  bts_dts_due: "BTS / DTS / DUE",
  autre: "AUTRE",
  non_precise: "NP",
};

/** Rattachement d'un diplôme BEILE à son étage national. `non_precise` n'est jamais la valeur par défaut. */
export const ETAGE_PAR_DIPLOME: Readonly<Partial<Record<Diplome, EtageDiplome>>> = {
  CAP: "bts_dts_due",
  BEP: "bts_dts_due",
  BT: "bts_dts_due",
  BTS: "bts_dts_due",
  CQP: "bts_dts_due",
  BAC: "licence_bachelor",
  BAC_TECHNIQUE: "licence_bachelor",
  LICENCE: "licence_bachelor",
  LICENCE_PRO: "licence_bachelor",
  MASTER: "master_dea_dess",
  MASTER_PRO: "master_dea_dess",
  DOCTORAT: "doctorat_des",
  DES: "doctorat_des",
};

/**
 * Examens nationaux dont le jury est une autorité de l'État (session, centre, numéro de table).
 * `Examen` (CEP/BEPC/BAC) reste inchangé pour ne rien casser du volet K-12 ; cette union l'étend aux
 * diplômes techniques, professionnels et supérieurs attestés au Bénin. La licence a bien un examen
 * national : la démarche du portail officiel se nomme « Diplôme de licence des examens nationaux »
 * (Direction des Examens et Concours Supérieurs). Le doctorat, lui, n'en connaît pas.
 */
export const ExamenNational = z.enum([
  "CEP", "BEPC", "BAC", "BAC_TECHNIQUE", "CAP", "BEP", "BT", "BTS", "CQP",
  "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DES",
]);
export type ExamenNational = z.infer<typeof ExamenNational>;

/**
 * Examen national ouvert à un diplôme. Total sauf pour les diplômes que `MODES_CERTIFICATION` ne
 * laisse qu'au jury d'établissement (doctorat) : les deux tables doivent se lire ensemble.
 */
export const EXAMEN_NATIONAL_PAR_DIPLOME: Readonly<Record<Exclude<Diplome, "DOCTORAT">, ExamenNational>> = {
  CAP: "CAP",
  BEP: "BEP",
  BAC: "BAC",
  BAC_TECHNIQUE: "BAC_TECHNIQUE",
  BT: "BT",
  BTS: "BTS",
  CQP: "CQP",
  LICENCE: "LICENCE",
  LICENCE_PRO: "LICENCE_PRO",
  MASTER: "MASTER",
  MASTER_PRO: "MASTER_PRO",
  DES: "DES",
};

/**
 * Code court du diplôme, pour l'identifiant de certificat. Nécessaire parce que le format en
 * vigueur `^CERT-[A-Z]+-\d{4}-\d{6}$` n'admet ni underscore ni chiffre : `LICENCE_PRO` ne peut
 * pas s'y écrire tel quel. Clé : tout diplôme BEILE et tout examen national, `CEP`/`BEPC` inclus.
 */
export const CodeCertificat = z.enum([
  "CEP", "BEPC", "BAC", "BACT", "CAP", "BEP", "BT", "BTS", "CQP",
  "LIC", "LPRO", "MAS", "MPRO", "DOC", "DES",
]);
export type CodeCertificat = z.infer<typeof CodeCertificat>;

export const CODE_CERTIFICAT: Readonly<Record<Diplome | ExamenNational, CodeCertificat>> = {
  CEP: "CEP",
  BEPC: "BEPC",
  BAC: "BAC",
  BAC_TECHNIQUE: "BACT",
  CAP: "CAP",
  BEP: "BEP",
  BT: "BT",
  BTS: "BTS",
  CQP: "CQP",
  LICENCE: "LIC",
  LICENCE_PRO: "LPRO",
  MASTER: "MAS",
  MASTER_PRO: "MPRO",
  DOCTORAT: "DOC",
  DES: "DES",
};

export const StatutJury = z.enum(["constitue", "reuni", "delibere", "publie"]);
export type StatutJury = z.infer<typeof StatutJury>;

/**
 * Office qui tient la session. Au Bénin ce ne sont pas les mêmes services : l'Office du Baccalauréat
 * (officedubacbenin.bj) pour le BAC, la Direction des Examens et Concours Supérieurs pour les
 * examens nationaux de l'supérieur, l'établissement pour une délibération sur crédits.
 */
export const OfficeDeliberant = z.enum(["office_du_bac", "dec_sup", "etablissement"]);
export type OfficeDeliberant = z.infer<typeof OfficeDeliberant>;

/** Jury : national pour un examen, d'établissement pour un diplôme par capitalisation. */
export const Jury = z.object({
  id: z.string(),
  autorite: ModeDeliberation,
  office: OfficeDeliberant.nullable(),
  /** Session officielle pour un examen national ; null pour un jury d'établissement. */
  sessionExamenId: z.string().nullable(),
  filiereId: z.string().nullable(),
  periodeId: z.string().nullable(),
  diplome: Diplome,
  president: z.string(),
  membres: z.array(z.string()),
  /** Le quorum est une condition de validité de la délibération, pas une information décorative. */
  quorum: z.number().int().positive(),
  statut: StatutJury,
  reuniLe: z.string().nullable(),
  /** Référence du procès-verbal papier : l'acte signé reste la source, BEILE en tient la trace. */
  pvReference: z.string().nullable(),
}).refine(
  (j) => modesCertificationDe(j.diplome).includes(j.autorite),
  { message: "Ce diplôme n'est pas délibéré par cette autorité." },
).refine(
  (j) => j.membres.length + 1 >= j.quorum,
  { message: "Le jury déclaré n'atteint pas son quorum." },
);
export type Jury = z.infer<typeof Jury>;

export const DecisionDiplome = z.enum(["admis", "admis_sous_reserve", "ajourne", "refuse"]);
export type DecisionDiplome = z.infer<typeof DecisionDiplome>;

/** Décision d'un jury portant sur un diplôme national. */
export const DeliberationDiplome = z.object({
  id: z.string(),
  apprenantId: z.string(),
  juryId: z.string(),
  etablissementId: z.string(),
  filiereId: z.string(),
  diplome: Diplome,
  decision: DecisionDiplome,
  creditsValides: z.number().int().nonnegative(),
  creditsRequis: z.number().int().nonnegative(),
  moyenneGenerale: z.number().min(0).max(20).nullable(),
  mention: Mention.nullable(),
  /** Ce qui manque. Sans cela, un ajournement n'est pas contestable. */
  ueManquantes: z.array(z.string()),
  delibereLe: z.string(),
  /** Certificat émis ; null tant que la certification n'a pas été produite. */
  certificatId: z.string().nullable(),
}).refine(
  (d) => d.decision !== "ajourne" || d.ueManquantes.length > 0,
  { message: "Un ajournement doit lister les UE manquantes." },
).refine(
  (d) => d.decision === "refuse" || d.creditsValides <= d.creditsRequis,
  { message: "Les crédits validés ne peuvent pas dépasser les crédits requis du diplôme." },
);
export type DeliberationDiplome = z.infer<typeof DeliberationDiplome>;

/* ================================================================== Vue agrégée */

/**
 * Contrat pédagogique d'un étudiant, tel qu'un écran le lit : ce qu'il a signé, ce qu'il a acquis,
 * ce qui reste. Rien d'estimé — une UE non évaluée figure dans `ueNonEvaluees`, jamais avec une
 * note inventée.
 */
export const ContratPedagogique = z.object({
  inscription: InscriptionSuperieure,
  voie: TypeParcours,
  ueSignees: z.array(z.object({
    inscriptionUe: InscriptionUE,
    ue: UniteEnseignement,
    offre: OffreUE,
    groupe: Groupe.nullable(),
  }).strict()),
  validations: z.array(ValidationUE),
  creditsAcquis: z.number().int().nonnegative(),
  creditsRestants: z.number().int().nonnegative(),
  ueNonEvaluees: z.array(z.string()),
  /** Règle effectivement appliquée, après précédence : l'étudiant voit la règle qui l'a jugé. */
  regleAppliquee: RegleValidation,
});
export type ContratPedagogique = z.infer<typeof ContratPedagogique>;
