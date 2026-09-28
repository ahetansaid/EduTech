import { z } from "zod";
import { CodeCertificat, OfficeDeliberant } from "./etudiants-superieur";

/**
 * Ce qu'un certificat atteste : les deux premiers examens béninois, le baccalauréat, et tout diplôme
 * national de l'EFTP ou du supérieur. Valeurs complètes — la colonne reste lisible ; le code court
 * (`CodeCertificat`) n'existe que pour l'identifiant `CERT-<code>-<année>-<ordre>`, qui n'admet ni
 * underscore ni chiffre. L'ensemble est exactement le domaine de `CODE_CERTIFICAT`.
 */
export const DiplomeAtteste = z.enum([
  "CEP", "BEPC", "CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP",
  "BAC", "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DOCTORAT", "DES",
]);
export type DiplomeAtteste = z.infer<typeof DiplomeAtteste>;

/**
 * Intitulé porté par l'attestation : un vérificateur lit ce nom, jamais un code. Deux familles s'y
 * rejoignent — les examens du K-12 et les diplômes nationaux de l'EFTP et du LMD. `DOCTORAT` n'a pas
 * d'examen national : il n'existe ici que comme diplôme certifié par le jury de l'établissement.
 */
export const NOM_DIPLOME_ATTESTE: Readonly<Record<DiplomeAtteste, string>> = {
  CEP: "Certificat d'études primaires",
  BEPC: "Brevet d'études du premier cycle",
  BAC: "Baccalauréat",
  BAC_TECHNIQUE: "Baccalauréat technique",
  CAP: "Certificat d'aptitude professionnelle",
  BEP: "Brevet d'études professionnelles",
  BT: "Brevet de technicien",
  BTS: "Brevet de technicien supérieur",
  CQP: "Certificat de qualification professionnelle",
  LICENCE: "Licence",
  LICENCE_PRO: "Licence professionnelle",
  MASTER: "Master",
  MASTER_PRO: "Master professionnel",
  DOCTORAT: "Doctorat",
  DES: "Diplôme d'études spécialisées",
};

/**
 * CERTIFICATE-ID : preuve vérifiable par un tiers, sans compte ni démarche (§7.2).
 *
 * `examen` dit ce qui est attesté ; `filiereId`, `etablissementId` et `office` disent de quelle filière,
 * où et sous quelle autorité — trois informations qu'un employeur compare au document présenté. Le volet
 * K-12 les a délivrés sans les nommer : elles y restent `null`, et c'est ce qui garde son sceau au format
 * historique. Toute certification du supérieur les remplit, au moins l'établissement.
 */
export const Certificat = z.object({
  id: z.string(),
  apprenantId: z.string(),
  examen: DiplomeAtteste,
  /** Filière certifiée — ce que le tiers peut comparer au relevé de notes. Null pour un examen national sans filière. */
  filiereId: z.string().nullable(),
  /** Établissement qui a délivré. Null tant que le certificat ne nommait pas son émetteur. */
  etablissementId: z.string().nullable(),
  /** L'office qui a délibéré : un diplôme scellé par la DEC n'a pas le même pesant qu'un diplôme d'établissement. */
  office: OfficeDeliberant.nullable(),
  session: z.string(),
  /** Null quand le jury admet sur les seuls crédits acquis, sans moyenne générale calculable — jamais un 0 inventé. */
  mention: z.string().nullable(),
  moyenne: z.number().nullable(),
  delivreLe: z.string(),
  /** Empreinte des champs signés : toute altération du document est détectée. */
  empreinte: z.string(),
  revoque: z.boolean(),
});
export type Certificat = z.infer<typeof Certificat>;

export const ResultatVerification = z.discriminatedUnion("statut", [
  z.object({
    statut: z.literal("authentique"),
    certificatId: z.string(),
    titulaire: z.string(),
    examen: DiplomeAtteste,
    filiere: z.string().nullable(),
    etablissement: z.string().nullable(),
    office: OfficeDeliberant.nullable(),
    session: z.string(),
    mention: z.string().nullable(),
    delivreLe: z.string(),
  }),
  /**
   * Le registre confirme que le diplôme existe mais ne nomme personne : l'identité d'un titulaire se
   * présente, elle ne se déduit pas. Sans cette branche, un identifiant dont la fin reprend le numéro
   * d'apprenant suffirait à faire défiler à un inconnu les noms, mentions et sessions d'une promotion.
   */
  z.object({
    statut: z.literal("sans_empreinte"),
    certificatId: z.string(),
    examen: DiplomeAtteste,
    session: z.string(),
    delivreLe: z.string(),
    explication: z.string(),
  }),
  z.object({ statut: z.literal("altere"), certificatId: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("revoque"), certificatId: z.string(), explication: z.string() }),
  z.object({ statut: z.literal("introuvable"), explication: z.string() }),
]);
export type ResultatVerification = z.infer<typeof ResultatVerification>;
