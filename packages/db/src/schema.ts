import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigint, boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp, unique, uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Schéma de données BEILE (docs/INFRASTRUCTURE.md §2.3).
 *
 * - core       : référentiels et état des personnes, protégé par RLS en production
 * - ledger     : registre des événements éducatifs, en AJOUT SEUL (déclencheur interdisant UPDATE/DELETE)
 * - audit      : journal des accès, accordés et refusés, en ajout seul
 * - analytics  : agrégats sans donnée nominative (cube statistique national)
 * - workflow   : moteur de circuits (demandes, étapes, décisions) — aucun circuit codé en dur
 * - sensible   : compartiment des données de sensibilité 4 (inclusion, protection) : chiffrement
 *                applicatif, accès au besoin d'en connaître, conservation limitée
 * - gouvernance: métadonnées de chaque élément de donnée (propriétaire, source de référence, qualité…)
 * - registre_simule : SIMULATION du registre national des personnes. En production, cette table
 *   n'existe pas : l'identité est interrogée auprès de l'ANIP via la plateforme d'interopérabilité.
 */

export const core = pgSchema("core");
export const ledger = pgSchema("ledger");
export const audit = pgSchema("audit");
export const analytics = pgSchema("analytics");
export const registreSimule = pgSchema("registre_simule");
export const workflow = pgSchema("workflow");
export const sensible = pgSchema("sensible");
export const gouvernance = pgSchema("gouvernance");

/** Validité temporelle : chaque information sait quand elle était vraie (docs/REGISTRE_COUVERTURE.md). */
const validite = () => ({
  valideDu: date("valide_du").notNull().default(sql`current_date`),
  valideAu: date("valide_au"),
});

/**
 * Diplômes nationaux des deux voies (LMD et EFTP), en une seule liste. Elle est partagée par les cinq
 * colonnes qui en portent un : l'ajouter ou le retirer se fait ici. `text(…, { enum })` reste du
 * `text` côté Postgres — aucune extension de type, aucune migration pour un diplôme de plus.
 */
const DIPLOMES = ["CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP", "BAC", "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DOCTORAT", "DES"] as const;

/** Composantes LMD ; null hors LMD (une filière CAP ou BTS n'a pas de « L1 »). */
const COMPOSANTES = ["L1", "L2", "L3", "M1", "M2", "Dr"] as const;

/**
 * Ce qu'un certificat atteste : les deux premiers examens, le baccalauréat et tout diplôme national.
 * Miroir du contrat `DiplomeAtteste` — la valeur est complète, le code court de l'identifiant s'en déduit.
 */
const DIPLOMES_ATTESTES = ["CEP", "BEPC", "CAP", "BEP", "BAC_TECHNIQUE", "BT", "BTS", "CQP", "BAC", "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DOCTORAT", "DES"] as const;

/** Examens nationaux dont une session peut être organisée, du primaire au master certifié par l'État. */
const EXAMENS_NATIONAUX = ["CEP", "BEPC", "BAC", "BAC_TECHNIQUE", "CAP", "BEP", "BT", "BTS", "CQP", "LICENCE", "LICENCE_PRO", "MASTER", "MASTER_PRO", "DES"] as const;

/** Office qui tient la délibération — le même pesant s'attache au certificat qu'elle produit. */
const OFFICES_DELIBERANTS = ["dec_memp", "dec_mestfp", "office_du_bac", "dec_sup", "etablissement"] as const;

/** Rythmes choisis par l'établissement. `modulaire` reste déclaré mais non attesté par un texte béninois. */
const REGIMES = ["semestriel", "trimestriel", "annuel", "modulaire"] as const;

/** Natures de période : le trimestre et le semestre coexistent, aucun des deux n'est la norme imposée. */
const TYPES_PERIODE = ["semestre", "trimestre", "annee", "module"] as const;

/** Sessions d'évaluation d'une UE : la normale puis le rattrapage. `hors_session` qualifie un acquis qui ne vient d'aucune composition (VAE, équivalence, acquis antérieur). */
const SESSIONS_EVALUATION = ["normale", "rattrapage", "hors_session"] as const;

/** Tutelles du supérieur : la double tutelle MESTFP + Emploi/PME est fréquente en EFTP. */
const TUTELLES = ["MESRS", "MESTFP", "EMPLOI_PME"] as const;

/** Vocabulaires du guichet et des allocations — miroirs de `packages/contracts/src/delivrance-actes.ts`. */
const TYPES_ACTE = [
  "releve_de_notes", "attestation_de_scolarite", "attestation_de_progression",
  "attestation_reussite_provisoire", "attestation_reussite_definitive", "diplome", "duplicata_de_diplome",
] as const;
const AUTORITES_DELIVRANCE = ["etablissement", "dec_sup", "dges", "dbau"] as const;
const STATUTS_DEMANDE = ["demandee", "en_instruction", "disponible", "remise", "refusee", "retiree"] as const;
const MODES_RETRAIT = ["titulaire", "geniteur", "mandataire", "autorite_academique", "dematerialise"] as const;
const PIECES_IDENTITE = [
  "carte_nationale_identite", "passeport", "acte_naissance", "procuration_notariee", "procuration_tribunal",
] as const;
const TYPES_DECISION_ALLOCATION = ["attribution", "renouvellement", "retablissement", "secours"] as const;
/**
 * Statut de compte, tel que le MESRS le compte dans ses effectifs. La demi-bourse et le secours sont des
 * formes distinctes du mécanisme réel (ask.gouv.bj n°7) : les confondre en un seul « boursier » fausserait
 * le décompte national. Aucun montant n'est attaché à ce vocabulaire.
 */
const STATUTS_COMPTE = ["boursier_integral", "demi_boursier", "secours", "payant", "non_precise"] as const;

/** Géométries PostGIS (SRID 4326). Écriture par ST_GeomFromGeoJSON, lecture par ST_AsGeoJSON. */
const multipolygone = customType<{ data: string; driverData: string }>({ dataType: () => "geometry(MultiPolygon, 4326)" });
const point = customType<{ data: string; driverData: string }>({ dataType: () => "geometry(Point, 4326)" });

/* ------------------------------------------------------------------ Référentiel territorial */

export const departements = core.table("departements", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  chefLieu: text("chef_lieu").notNull(),
  geom: multipolygone("geom"),
});

export const communes = core.table("communes", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  departementId: text("departement_id").notNull().references(() => departements.id),
  milieu: text("milieu", { enum: ["urbain", "rural"] }).notNull(),
  geom: multipolygone("geom"),
}, (t) => [index("communes_departement_idx").on(t.departementId)]);

/* ------------------------------------------------------------------ Établissements et classes */

/**
 * Institutions des trois ministères : de la maternelle à l'université, en passant par le technique,
 * la formation professionnelle, l'alphabétisation et les centres d'examen.
 */
export const etablissements = core.table("etablissements", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  typeInstitution: text("type_institution", {
    enum: ["ecole_maternelle", "ecole_primaire", "college", "lycee_general", "lycee_technique", "centre_formation_professionnelle", "centre_alphabetisation", "universite", "ecole_superieure", "centre_examen", "ecole_nationale", "institut", "institut_regional_formation_professionnelle", "institut_national_formation_professionnelle", "ecole_d_application"],
  }).notNull(),
  ministereTutelle: text("ministere_tutelle", { enum: ["MEMP", "MESTFP", "MESRS"] }).notNull(),
  cycle: text("cycle", { enum: ["primaire", "secondaire", "superieur"] }).notNull(),
  statut: text("statut", { enum: ["public", "prive", "confessionnel", "communautaire"] }).notNull(),
  gestionnaire: text("gestionnaire"),
  agrement: text("agrement"),
  /** Sigle de l'établissement (ex. UAC, ENAM) ; renseigné surtout pour le supérieur. */
  sigle: text("sigle"),
  /** Tutelle(s) pour le supérieur : la double tutelle MESTFP + Emploi/PME est fréquente en EFTP. Vide pour le K-12. */
  tutelles: text("tutelles", { enum: TUTELLES }).array(),
  /** Établissement-parent pour une école rattachée (ex. ENAM → UAC) ; null sinon. */
  rattachementId: text("rattachement_id").references((): AnyPgColumn => etablissements.id),
  communeId: text("commune_id").notNull().references(() => communes.id),
  circonscription: text("circonscription").notNull(),
  position: point("position"),
  capacite: integer("capacite").notNull(),
  sallesDeClasse: integer("salles_de_classe").notNull(),
  infrastructures: jsonb("infrastructures").$type<{ eau: boolean; electricite: boolean; internet: boolean; latrines: boolean; bibliotheque: boolean }>().notNull(),
  effectifDeclare: integer("effectif_declare").notNull(),
  enseignantsDeclares: integer("enseignants_declares").notNull(),
  transmis: boolean("transmis").notNull().default(true),
  pilote: boolean("pilote").notNull().default(false),
  ...validite(),
}, (t) => [index("etablissements_commune_idx").on(t.communeId), index("etablissements_position_idx").using("gist", t.position)]);

/**
 * Arbre des organisations de l'État, support de l'administration déléguée en cascade :
 * autorité de la plateforme → ministères et organismes → directions départementales et universités →
 * circonscriptions → établissements. Chaque administrateur n'agit que dans son sous-arbre.
 */
export const organisations = core.table("organisations", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["autorite", "ministere", "organisme", "departement", "universite", "circonscription", "etablissement"] }).notNull(),
  nom: text("nom").notNull(),
  parentId: text("parent_id").references((): AnyPgColumn => organisations.id),
  /** Ministère de tutelle (MEMP, MESTFP, MESRS) pour les nœuds qui en relèvent. */
  ministere: text("ministere"),
  departementId: text("departement_id").references(() => departements.id),
  circonscription: text("circonscription"),
  etablissementId: text("etablissement_id").references((): AnyPgColumn => etablissements.id),
  actif: boolean("actif").notNull().default(true),
}, (t) => [index("organisations_parent_idx").on(t.parentId), uniqueIndex("organisations_etablissement_uq").on(t.etablissementId)]);

/**
 * Délégation d'administration (un « chapeau » d'administrateur) : niveau 0 (autorité) à 4 (référent de
 * proximité), sur une organisation, avec les rôles métier qu'elle permet d'attribuer. Toujours datée,
 * garantie par celui qui l'accorde, révocable ; les nominations sensibles attendent une seconde validation.
 */
export const delegations = core.table("delegations", {
  id: text("id").primaryKey(),
  profilId: text("profil_id").notNull().references(() => profils.id),
  organisationId: text("organisation_id").notNull().references(() => organisations.id),
  niveau: integer("niveau").notNull(),
  rolesDelegables: text("roles_delegables").array().notNull(),
  peutNommer: boolean("peut_nommer").notNull().default(false),
  statut: text("statut", { enum: ["en_attente", "active", "revoquee", "refusee"] }).notNull(),
  accordeePar: text("accordee_par").references(() => profils.id),
  valideePar: text("validee_par").references(() => profils.id),
  motif: text("motif"),
  du: timestamp("du", { withTimezone: true }).notNull().defaultNow(),
  au: timestamp("au", { withTimezone: true }).notNull(),
  revoqueeLe: timestamp("revoquee_le", { withTimezone: true }),
  revoqueePar: text("revoquee_par").references(() => profils.id),
}, (t) => [index("delegations_profil_idx").on(t.profilId), index("delegations_organisation_idx").on(t.organisationId)]);

/**
 * Attribution d'un rôle métier (un autre « chapeau ») : rôle et périmètre, garant, date de fin.
 * Le registre des droits ; `profils.habilitations` en porte l'ensemble effectif (ajout à l'attribution,
 * retrait à la révocation ou à l'échéance).
 */
export const attributions = core.table("attributions", {
  id: text("id").primaryKey(),
  profilId: text("profil_id").notNull().references(() => profils.id),
  role: text("role").notNull(),
  perimetre: jsonb("perimetre").notNull(),
  organisationId: text("organisation_id").notNull().references(() => organisations.id),
  accordeePar: text("accordee_par").references(() => profils.id),
  motif: text("motif"),
  du: timestamp("du", { withTimezone: true }).notNull().defaultNow(),
  au: timestamp("au", { withTimezone: true }).notNull(),
  revoqueeLe: timestamp("revoquee_le", { withTimezone: true }),
  revoqueePar: text("revoquee_par").references(() => profils.id),
  motifRevocation: text("motif_revocation"),
}, (t) => [index("attributions_profil_idx").on(t.profilId), index("attributions_organisation_idx").on(t.organisationId)]);

/**
 * Référentiel réel des établissements du Bénin (annuaire public) : listes officielles des ministères
 * (universités publiques et leurs composantes, établissements privés du supérieur, EFTP) et cartographie
 * collaborative OpenStreetMap (© contributeurs OSM, ODbL). Chaque ligne porte sa source et son niveau de
 * preuve ; aucune valeur n'est inventée (pas de position sans coordonnées, pas de type deviné).
 * Distinct de core.etablissements, qui porte le jeu de démonstration du pilotage : les deux ne se mêlent pas.
 * Lecture seule pour l'application ; chargé par `npm run referentiel -w @beile/db`.
 */
export const referentielEtablissements = core.table("referentiel_etablissements", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  sigle: text("sigle"),
  type: text("type").notNull(),
  typeLibelle: text("type_libelle").notNull(),
  /** Niveaux d'enseignement couverts : maternelle, primaire, secondaire, technique, superieur (vide si inconnu). */
  niveaux: text("niveaux").array().notNull(),
  statut: text("statut", { enum: ["public", "prive", "confessionnel", "communautaire", "non_indique"] }).notNull(),
  communeId: text("commune_id").references(() => communes.id),
  /** Université ou tutelle de rattachement (sigle), pour les composantes. */
  rattachement: text("rattachement"),
  position: point("position"),
  source: text("source").notNull(),
  preuve: text("preuve", { enum: ["officielle", "recoupee", "cartographie_collaborative"] }).notNull(),
  remarque: text("remarque"),
  importeLe: timestamp("importe_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("referentiel_etab_commune_idx").on(t.communeId), index("referentiel_etab_position_idx").using("gist", t.position)]);

export const classes = core.table("classes", {
  id: text("id").primaryKey(),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  niveau: text("niveau").notNull(),
  libelle: text("libelle").notNull(),
  anneeScolaire: text("annee_scolaire").notNull(),
  capacite: integer("capacite").notNull(),
  enseignantPrincipalId: text("enseignant_principal_id"),
}, (t) => [index("classes_etablissement_idx").on(t.etablissementId)]);

/* ------------------------------------------------------------------ Personnes */

export const personnes = registreSimule.table("personnes", {
  npi: text("npi").primaryKey(),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  dateNaissance: date("date_naissance").notNull(),
  sexe: text("sexe", { enum: ["F", "M"] }).notNull(),
  communeNaissanceId: text("commune_naissance_id").notNull(),
  parentsNpi: text("parents_npi").array().notNull().default(sql`'{}'::text[]`),
});

export const apprenants = core.table("apprenants", {
  id: text("id").primaryKey(),
  npi: text("npi").unique(),
  statutIdentite: text("statut_identite", { enum: ["verifiee", "regularisation_en_cours"] }).notNull(),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  dateNaissance: date("date_naissance").notNull(),
  sexe: text("sexe", { enum: ["F", "M"] }).notNull(),
  besoinsParticuliers: boolean("besoins_particuliers").notNull().default(false),
});

export const enseignants = core.table("enseignants", {
  id: text("id").primaryKey(),
  npi: text("npi").notNull().unique(),
  nom: text("nom").notNull(),
  prenoms: text("prenoms").notNull(),
  sexe: text("sexe", { enum: ["F", "M"] }).notNull(),
  matieres: text("matieres").array().notNull(),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  grade: text("grade").notNull(),
  dateRecrutement: date("date_recrutement").notNull(),
});

export const liensFamiliaux = core.table("liens_familiaux", {
  responsableNpi: text("responsable_npi").notNull(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  nature: text("nature", { enum: ["parent", "tuteur"] }).notNull(),
  verifie: boolean("verifie").notNull(),
}, (t) => [primaryKey({ columns: [t.responsableNpi, t.apprenantId] }), index("liens_apprenant_idx").on(t.apprenantId)]);

/**
 * Parcours : une personne peut en mener plusieurs en parallèle (scolaire, technique, universitaire,
 * professionnel, formation courte, apprentissage, alphabétisation). « Une personne = une formation » est exclu.
 */
export const parcours = core.table("parcours", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  type: text("type", { enum: ["scolaire", "technique", "professionnel", "universitaire", "apprentissage", "formation_courte", "alphabetisation"] }).notNull(),
  institutionId: text("institution_id").references(() => etablissements.id),
  intitule: text("intitule").notNull(),
  statut: text("statut", { enum: ["en_cours", "termine", "interrompu"] }).notNull(),
  ...validite(),
}, (t) => [index("parcours_apprenant_idx").on(t.apprenantId)]);

/** Affectations des personnels, datées : l'historique d'un enseignant se lit d'un établissement à l'autre. */
export const affectations = core.table("affectations", {
  id: text("id").primaryKey(),
  enseignantId: text("enseignant_id").notNull().references(() => enseignants.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  fonction: text("fonction").notNull(),
  ...validite(),
}, (t) => [index("affectations_enseignant_idx").on(t.enseignantId)]);

/** Référentiel de compétences : ce que l'apprenant maîtrise, pas seulement la note obtenue. */
export const competences = core.table("competences", {
  id: text("id").primaryKey(),
  matiere: text("matiere").notNull(),
  domaine: text("domaine").notNull(),
  libelle: text("libelle").notNull(),
  niveaux: text("niveaux").array().notNull(),
  version: text("version").notNull(),
});

/** Relation pédagogique : qui enseigne quelle matière à quelle classe (critère « relation » de l'ABAC). */
export const enseignements = core.table("enseignements", {
  enseignantId: text("enseignant_id").notNull().references(() => enseignants.id),
  classeId: text("classe_id").notNull().references(() => classes.id),
  matiere: text("matiere").notNull(),
}, (t) => [primaryKey({ columns: [t.enseignantId, t.classeId, t.matiere] })]);

/**
 * Un diplôme certifié, vérifiable par un tiers. `examen` porte la valeur complète de ce qui est attesté
 * (le code court n'existe que dans l'identifiant). Le volet K-12 n'a jamais nommé sa filière ni son
 * établissement : ces trois colonnes sont `nullable` et les lignes déjà délivrées les gardent vides. Pour
 * le supérieur elles se remplissent — une « Licence » sans filière ni université ne prouve rien — et c'est
 * l'API qui les écrit, jamais la saisie d'un vérificateur.
 *
 * `mention` et `moyenne` deviennent nullables : un jury de capitalisation peut admettre sur les seuls
 * crédits acquis, sans moyenne générale calculable. Écrire 0 ou « Passable » serait une décision que le
 * jury n'a jamais prise.
 */
export const certificats = core.table("certificats", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  examen: text("examen", { enum: DIPLOMES_ATTESTES }).notNull(),
  /** Filière certifiée : ce que le tiers compare au relevé. Clé étrangère : un certificat ne nomme pas une filière inexistante. */
  filiereId: text("filiere_id").references((): AnyPgColumn => filiereSuperieure.id),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  office: text("office", { enum: OFFICES_DELIBERANTS }),
  session: text("session").notNull(),
  mention: text("mention"),
  moyenne: numeric("moyenne", { precision: 4, scale: 2, mode: "number" }),
  delivreLe: date("delivre_le").notNull(),
  empreinte: text("empreinte").notNull(),
  revoque: boolean("revoque").notNull().default(false),
});

/* ------------------------------------------------------------------ Examens nationaux (modèle e-résultat : session, centre, candidat, publication) */

/**
 * Session officielle d'un examen national, avec son cycle de publication. Une ligne par (examen, session).
 * Le statut ne bascule sur « publiee » qu'après délibération : avant, la recherche publique ne renvoie rien.
 */
export const examensSessions = core.table("examens_sessions", {
  id: text("id").primaryKey(),
  examen: text("examen", { enum: EXAMENS_NATIONAUX }).notNull(),
  session: text("session").notNull(),
  statut: text("statut", { enum: ["ouverte", "composition", "deliberation", "publiee"] }).notNull().default("ouverte"),
  arretCandidatures: date("arret_candidatures"),
  publieeLe: date("publiee_le"),
}, (t) => [uniqueIndex("examens_sessions_examen_session_uq").on(t.examen, t.session)]);

/** Centre d'examen (lieu physique où compose le candidat) ; rattaché à une commune pour la cartographie. */
export const examensCentres = core.table("examens_centres", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  communeId: text("commune_id").notNull().references(() => communes.id),
  capacite: integer("capacite").notNull().default(0),
}, (t) => [index("examens_centres_commune_idx").on(t.communeId)]);

/**
 * Candidature d'un apprenant à une session : centre retenu et numéro de table, la clé que le public
 * saisit pour retrouver son sort. Verdicts (décision, moyenne, mention) renseignés à la délibération,
 * figés à la publication. Le numéro de table est unique au sein d'une session, jamais réutilisé.
 */
export const examensCandidatures = core.table("examens_candidatures", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull().references(() => examensSessions.id),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  centreId: text("centre_id").notNull().references(() => examensCentres.id),
  numeroTable: text("numero_table").notNull(),
  decision: text("decision", { enum: ["admis", "non_admis", "absent", "exclu"] }),
  moyenne: numeric("moyenne", { precision: 4, scale: 2, mode: "number" }),
  mention: text("mention"),
}, (t) => [
  uniqueIndex("examens_candidatures_session_table_uq").on(t.sessionId, t.numeroTable),
  uniqueIndex("examens_candidatures_session_apprenant_uq").on(t.sessionId, t.apprenantId),
  index("examens_candidatures_apprenant_idx").on(t.apprenantId),
]);

/** Comptes de démonstration et leurs habilitations (en production : fournisseur d'identité OIDC). */
export const profils = core.table("profils", {
  id: text("id").primaryKey(),
  nomAffiche: text("nom_affiche").notNull(),
  fonction: text("fonction").notNull(),
  npi: text("npi"),
  habilitations: jsonb("habilitations").notNull(),
});

/* ------------------------------------------------------------------ Registre d'événements (ajout seul) */

export const evenements = ledger.table("evenements", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  survenuLe: timestamp("survenu_le", { withTimezone: true }).notNull(),
  enregistreLe: timestamp("enregistre_le", { withTimezone: true }).notNull().defaultNow(),
  auteurId: text("auteur_id").notNull(),
  source: text("source", { enum: ["beile", "registre_national", "educmaster", "examens", "universite", "dbau"] }).notNull(),
  etablissementId: text("etablissement_id"),
  apprenantId: text("apprenant_id"),
  enseignantId: text("enseignant_id"),
  /** Charge utile propre au type d'événement, validée par le schéma zod du contrat avant insertion. */
  donnees: jsonb("donnees").notNull(),
}, (t) => [
  index("evenements_apprenant_idx").on(t.apprenantId, t.survenuLe),
  index("evenements_etablissement_idx").on(t.etablissementId, t.survenuLe),
  index("evenements_type_idx").on(t.type),
]);

/* ------------------------------------------------------------------ Journal d'audit (ajout seul) */

export const journal = audit.table("journal", {
  id: text("id").primaryKey(),
  horodatage: timestamp("horodatage", { withTimezone: true }).notNull().defaultNow(),
  profilId: text("profil_id").notNull(),
  profilNom: text("profil_nom").notNull(),
  action: text("action").notNull(),
  ressource: text("ressource").notNull(),
  finalite: text("finalite").notNull(),
  autorise: boolean("autorise").notNull(),
  critereManquant: text("critere_manquant"),
}, (t) => [index("journal_horodatage_idx").on(t.horodatage), index("journal_profil_idx").on(t.profilId)]);

/* ------------------------------------------------------------------ Cube statistique (sans donnée nominative) */

export const cellules = analytics.table("cellules", {
  communeId: text("commune_id").notNull().references(() => communes.id),
  annee: text("annee").notNull(),
  niveau: text("niveau").notNull(),
  sexe: text("sexe", { enum: ["F", "M"] }).notNull(),
  effectif: integer("effectif").notNull(),
  moyMaths: doublePrecision("moy_maths").notNull(),
  etMaths: doublePrecision("et_maths").notNull(),
  moyFrancais: doublePrecision("moy_francais").notNull(),
  etFrancais: doublePrecision("et_francais").notNull(),
}, (t) => [primaryKey({ columns: [t.communeId, t.annee, t.niveau, t.sexe] })]);

export const communesAnnee = analytics.table("communes_annee", {
  communeId: text("commune_id").notNull().references(() => communes.id),
  annee: text("annee").notNull(),
  capacite: integer("capacite").notNull(),
  enseignants: integer("enseignants").notNull(),
  enseignantsQualifies: integer("enseignants_qualifies").notNull(),
  tauxAbsenteisme: doublePrecision("taux_absenteisme").notNull(),
  tauxAbandon: doublePrecision("taux_abandon").notNull(),
  populationScolarisable: integer("population_scolarisable").notNull(),
  couverture: doublePrecision("couverture").notNull(),
  fraicheurJours: integer("fraicheur_jours").notNull(),
  examens: jsonb("examens").notNull(),
}, (t) => [primaryKey({ columns: [t.communeId, t.annee] })]);

/* ------------------------------------------------------------------ Moteur de workflow */

/** Circuit paramétrable : chaque demande suit un modèle d'étapes, sans code dédié. */
export const modelesCircuit = workflow.table("modeles", {
  code: text("code").primaryKey(),
  libelle: text("libelle").notNull(),
  etapes: jsonb("etapes").$type<{ ordre: number; code: string; role: string; delaiJours: number }[]>().notNull(),
  version: text("version").notNull(),
});

export const demandes = workflow.table("demandes", {
  id: text("id").primaryKey(),
  modele: text("modele").notNull().references(() => modelesCircuit.code),
  objet: text("objet").notNull(),
  demandeurId: text("demandeur_id").notNull(),
  ressource: text("ressource"),
  /** Charge utile propre au circuit (ex. AFFECTATION : enseignantId, versEtablissementId, fonction). Jamais nominative. */
  donnees: jsonb("donnees").$type<Record<string, unknown> | null>(),
  etapeCourante: text("etape_courante").notNull(),
  statut: text("statut", { enum: ["ouverte", "en_cours", "acceptee", "refusee", "close"] }).notNull(),
  creeeLe: timestamp("creee_le", { withTimezone: true }).notNull().defaultNow(),
  echeance: timestamp("echeance", { withTimezone: true }),
}, (t) => [index("demandes_statut_idx").on(t.statut)]);

export const decisions = workflow.table("decisions", {
  id: text("id").primaryKey(),
  demandeId: text("demande_id").notNull().references(() => demandes.id),
  etape: text("etape").notNull(),
  auteurId: text("auteur_id").notNull(),
  decision: text("decision", { enum: ["valide", "refuse", "renvoye"] }).notNull(),
  motif: text("motif"),
  horodatage: timestamp("horodatage", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ Compartiment sensible */

/**
 * Gestion de cas (protection, besoins particuliers). Aucune colonne lisible : le contenu est chiffré
 * côté application (clé en coffre), l'accès relève du besoin d'en connaître et chaque lecture est journalisée.
 */
export const cas = sensible.table("cas", {
  id: text("id").primaryKey(),
  categorie: text("categorie", { enum: ["protection", "besoins_particuliers", "sante_orientation"] }).notNull(),
  apprenantId: text("apprenant_id").notNull(),
  referentId: text("referent_id").notNull(),
  contenuChiffre: text("contenu_chiffre").notNull(),
  niveauAcces: integer("niveau_acces").notNull().default(4),
  ouvertLe: timestamp("ouvert_le", { withTimezone: true }).notNull().defaultNow(),
  conserverJusquAu: date("conserver_jusqu_au").notNull(),
});

/* ------------------------------------------------------------------ Gouvernance des données */

export const elementsDonnees = gouvernance.table("elements_donnees", {
  code: text("code").primaryKey(),
  definition: text("definition").notNull(),
  proprietaire: text("proprietaire").notNull(),
  gestionnaire: text("gestionnaire").notNull(),
  sourceReference: text("source_reference").notNull(),
  regleQualite: text("regle_qualite"),
  politiqueAcces: text("politique_acces").notNull(),
  sensibilite: integer("sensibilite").notNull(),
  conservation: text("conservation").notNull(),
  finalite: text("finalite").notNull(),
  frequence: text("frequence").notNull(),
  version: text("version").notNull(),
});

/* ------------------------------------------------------------------ Comptes, sessions, notifications */

/**
 * Comptes de connexion. Une personne peut détenir un compte rattaché à un profil d'habilitations.
 * Mot de passe : scrypt (sel unique), jamais stocké en clair. Verrouillage après échecs répétés.
 */
export const comptes = core.table("comptes", {
  id: text("id").primaryKey(),
  identifiant: text("identifiant").notNull().unique(),
  motDePasseHash: text("mot_de_passe_hash").notNull(),
  profilId: text("profil_id").notNull().references(() => profils.id),
  actif: boolean("actif").notNull().default(true),
  doitChangerMotDePasse: boolean("doit_changer_mot_de_passe").notNull().default(false),
  echecsConsecutifs: integer("echecs_consecutifs").notNull().default(0),
  verrouilleJusquA: timestamp("verrouille_jusqu_a", { withTimezone: true }),
  derniereConnexion: timestamp("derniere_connexion", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  /** Canaux d'activation et de récupération : un code à usage unique n'est envoyé qu'ici. */
  telephone: text("telephone"),
  courriel: text("courriel"),
  telephoneVerifie: boolean("telephone_verifie").notNull().default(false),
  courrielVerifie: boolean("courriel_verifie").notNull().default(false),
  /** Second facteur : secret TOTP chiffré (AES-256-GCM), jamais en clair ; clés FIDO2 dans core.cles_fido. */
  totpChiffre: text("totp_chiffre"),
  /** Dernier pas TOTP accepté : un même code ne sert qu'une fois (anti-rejeu). */
  totpDernierPas: integer("totp_dernier_pas"),
  mfaActive: boolean("mfa_active").notNull().default(false),
}, (t) => [index("comptes_profil_idx").on(t.profilId)]);

/** Sessions : seule l'empreinte SHA-256 du jeton est conservée ; le jeton ne vit que dans un cookie HttpOnly. */
export const sessions = core.table("sessions", {
  empreinte: text("empreinte").primaryKey(),
  compteId: text("compte_id").notNull().references(() => comptes.id),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  derniereActivite: timestamp("derniere_activite", { withTimezone: true }).notNull().defaultNow(),
  adresseIp: text("adresse_ip"),
  agent: text("agent"),
  revoquee: boolean("revoquee").notNull().default(false),
  /** Second facteur présenté pour cette session (exigé des administrateurs de niveau 0 à 2). */
  mfaVerifie: boolean("mfa_verifie").notNull().default(false),
  /** Élévation « juste à temps » : actions d'administration permises jusqu'à cette heure, après re-vérification. */
  eleveJusquA: timestamp("eleve_jusqu_a", { withTimezone: true }),
}, (t) => [index("sessions_compte_idx").on(t.compteId)]);

/**
 * Codes à usage unique (activation, récupération) : seule une empreinte HMAC est conservée ; 10 minutes,
 * 5 essais, un seul usage. Le code ne vit que dans le SMS ou le courriel envoyé.
 */
export const codesUsageUnique = core.table("codes_usage_unique", {
  id: text("id").primaryKey(),
  compteId: text("compte_id").notNull().references(() => comptes.id),
  objet: text("objet", { enum: ["activation", "recuperation", "verification"] }).notNull(),
  canal: text("canal", { enum: ["sms", "courriel"] }).notNull(),
  empreinte: text("empreinte").notNull(),
  /** Vérification d'une nouvelle coordonnée : la destination proposée, chiffrée, adoptée seulement si le code revient. */
  destinationChiffree: text("destination_chiffree"),
  expireLe: timestamp("expire_le", { withTimezone: true }).notNull(),
  tentatives: integer("tentatives").notNull().default(0),
  utiliseLe: timestamp("utilise_le", { withTimezone: true }),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("codes_compte_idx").on(t.compteId, t.creeLe)]);

/**
 * Messages sortants (SMS, courriel) : trace de chaque envoi. Le texte n'est conservé en clair que par le
 * fournisseur « journal » (développement, recette) ; avec un vrai fournisseur, le code y est masqué.
 */
export const messagesSortants = core.table("messages_sortants", {
  id: text("id").primaryKey(),
  compteId: text("compte_id").references(() => comptes.id),
  canal: text("canal", { enum: ["sms", "courriel"] }).notNull(),
  destinataire: text("destinataire").notNull(),
  objet: text("objet").notNull(),
  texte: text("texte").notNull(),
  fournisseur: text("fournisseur").notNull(),
  statut: text("statut", { enum: ["envoye", "echec"] }).notNull(),
  erreur: text("erreur"),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("messages_compte_idx").on(t.compteId, t.creeLe)]);

/** Clés de sécurité FIDO2 / WebAuthn (clé publique seulement), et codes de secours à usage unique (empreintes). */
export const clesFido = core.table("cles_fido", {
  id: text("id").primaryKey(),
  compteId: text("compte_id").notNull().references(() => comptes.id),
  clePublique: text("cle_publique").notNull(),
  compteur: integer("compteur").notNull().default(0),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  nom: text("nom").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  utiliseeLe: timestamp("utilisee_le", { withTimezone: true }),
}, (t) => [index("cles_fido_compte_idx").on(t.compteId)]);

export const codesSecours = core.table("codes_secours", {
  id: text("id").primaryKey(),
  compteId: text("compte_id").notNull().references(() => comptes.id),
  empreinte: text("empreinte").notNull(),
  utiliseLe: timestamp("utilise_le", { withTimezone: true }),
}, (t) => [index("codes_secours_compte_idx").on(t.compteId)]);

/** Alertes de sécurité détectées automatiquement (refus en rafale, nouvel appareil d'administrateur…). */
export const alertesSecurite = core.table("alertes_securite", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  gravite: text("gravite", { enum: ["info", "moyenne", "haute"] }).notNull(),
  profilId: text("profil_id").references(() => profils.id),
  cle: text("cle").notNull(),
  detail: text("detail").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  traiteeLe: timestamp("traitee_le", { withTimezone: true }),
  traiteePar: text("traitee_par").references(() => profils.id),
  suite: text("suite"),
}, (t) => [uniqueIndex("alertes_securite_cle_uq").on(t.cle), index("alertes_securite_date_idx").on(t.creeLe)]);

/** Notifications nées des faits du registre (absence, note, inscription…), destinées à une personne. */
export const notifications = core.table("notifications", {
  id: text("id").primaryKey(),
  destinataireNpi: text("destinataire_npi").notNull(),
  titre: text("titre").notNull(),
  texte: text("texte").notNull(),
  evenementId: text("evenement_id"),
  lue: boolean("lue").notNull().default(false),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("notifications_destinataire_idx").on(t.destinataireNpi, t.creeLe)]);

/* ------------------------------------------------------------------ Projection de lecture (CQRS) */

/**
 * Situation courante de chaque apprenant, tenue à jour dans la même transaction que l'écriture au registre.
 * Le registre (ledger.evenements) reste la source de vérité : cette table est reconstructible à tout moment
 * (npm run projections -w @beile/db). Elle permet des lectures indexées à l'échelle nationale.
 */
export const scolarites = core.table("scolarites", {
  apprenantId: text("apprenant_id").primaryKey().references(() => apprenants.id),
  classeId: text("classe_id").references(() => classes.id),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  statut: text("statut", { enum: ["scolarise", "abandon", "non_inscrit"] }).notNull(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("scolarites_classe_idx").on(t.classeId), index("scolarites_etablissement_idx").on(t.etablissementId, t.statut)]);

/**
 * Notes effectives (projection) : une ligne par évaluation, la correction la plus récente appliquée.
 * Tenue à jour dans la transaction d'écriture au registre ; reconstructible depuis ledger.evenements.
 * Colonnes typées et indexées : les moyennes se calculent sans relire le JSON du registre.
 */
export const notes = core.table("notes", {
  evenementId: text("evenement_id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  classeId: text("classe_id").notNull(),
  matiere: text("matiere").notNull(),
  trimestre: integer("trimestre").notNull(),
  note: doublePrecision("note").notNull(),
  noteInitiale: doublePrecision("note_initiale").notNull(),
  corrigee: boolean("corrigee").notNull().default(false),
  survenuLe: timestamp("survenu_le", { withTimezone: true }).notNull(),
}, (t) => [index("notes_apprenant_idx").on(t.apprenantId, t.matiere, t.survenuLe), index("notes_classe_idx").on(t.classeId, t.matiere)]);

/* ------------------------------------------------------------------ Assistance (support aux utilisateurs) */

/**
 * Demandes d'assistance : tout utilisateur connecté en ouvre, l'administration les traite. Aucune suppression :
 * une demande se clôt, son fil reste consultable (traçabilité du support).
 */
export const tickets = core.table("tickets", {
  id: text("id").primaryKey(),
  auteurCompteId: text("auteur_compte_id").notNull().references(() => comptes.id),
  categorie: text("categorie", { enum: ["connexion", "donnees", "acces", "bug", "autre"] }).notNull(),
  priorite: text("priorite", { enum: ["basse", "normale", "haute", "critique"] }).notNull().default("normale"),
  sujet: text("sujet").notNull(),
  description: text("description").notNull(),
  statut: text("statut", { enum: ["ouvert", "en_cours", "resolu", "clos"] }).notNull().default("ouvert"),
  assigneCompteId: text("assigne_compte_id").references(() => comptes.id),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  resoluLe: timestamp("resolu_le", { withTimezone: true }),
}, (t) => [index("tickets_auteur_idx").on(t.auteurCompteId, t.majLe), index("tickets_statut_idx").on(t.statut, t.majLe)]);

/** Fil de discussion d'une demande : messages de l'auteur et de l'administration, en ajout seul côté API. */
export const ticketsMessages = core.table("tickets_messages", {
  id: text("id").primaryKey(),
  ticketId: text("ticket_id").notNull().references(() => tickets.id),
  auteurCompteId: text("auteur_compte_id").notNull().references(() => comptes.id),
  auteurNom: text("auteur_nom").notNull(),
  deLAdministration: boolean("de_l_administration").notNull().default(false),
  contenu: text("contenu").notNull(),
  creeLe: timestamp("cree_le", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("tickets_messages_ticket_idx").on(t.ticketId, t.creeLe)]);

/* ------------------------------------------------------------------ Calendrier scolaire */

/**
 * Calendrier de l'année scolaire, géré par l'administration. Chaque échéance porte un statut :
 * « officiel » (fixé par arrêté) ou « provisoire » (affiché comme tel au public, jamais comme une date officielle).
 */
export const calendrier = core.table("calendrier", {
  id: text("id").primaryKey(),
  annee: text("annee").notNull(),
  titre: text("titre").notNull(),
  categorie: text("categorie", { enum: ["rentree", "trimestre", "conges", "ferie", "examen", "evaluation", "fin", "autre"] }).notNull(),
  debut: date("debut").notNull(),
  fin: date("fin").notNull(),
  statut: text("statut", { enum: ["officiel", "provisoire"] }).notNull().default("provisoire"),
  note: text("note"),
  majLe: timestamp("maj_le", { withTimezone: true }).notNull().defaultNow(),
  majPar: text("maj_par"),
}, (t) => [index("calendrier_annee_idx").on(t.annee, t.debut)]);

/**
 * Absences justifiées : projection des décisions « validée » de l'établissement. Le fait ABSENCE est en
 * ajout seul et naît « non justifié » ; c'est la DECISION_JUSTIFICATION qui le justifie. Sans cette
 * projection, chaque lecteur (enseignant, statistiques, famille) devrait refaire la jointure sur le
 * registre — et l'un d'eux l'oublierait. Une ligne par absence, clé primaire : une seule justification.
 */
export const absencesJustifiees = core.table("absences_justifiees", {
  absenceId: text("absence_id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  justificationId: text("justification_id").notNull(),
  decisionEvenementId: text("decision_evenement_id").notNull(),
  justifieeLe: timestamp("justifiee_le", { withTimezone: true }).notNull(),
}, (t) => [index("absences_justifiees_apprenant_idx").on(t.apprenantId)]);

/**
 * Compteurs de la limite de débit PARTAGÉE : sur un hébergement serverless, chaque instance a sa propre
 * mémoire, et un plafond tenu en mémoire se contourne en tombant sur une autre instance. Une ligne par
 * (clé, fenêtre) ; l'incrément est atomique (`insert … on conflict do update … returning`).
 */
export const compteursDebit = core.table("compteurs_debit", {
  cle: text("cle").notNull(),
  fenetre: bigint("fenetre", { mode: "number" }).notNull(),
  n: integer("n").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.cle, t.fenetre] }), index("compteurs_debit_fenetre_idx").on(t.fenetre)]);

/* ------------------------------------------------------------------ Enseignement supérieur & formation professionnelle
 * Miroir en base des contrats zod `packages/contracts/src/enseignement-superieur.ts` (S0). Trois voies
 * (université MESRS, écoles nationales rattachées, EFTP MESTFP + Emploi/PME), deux carrefours (BAC ;
 * passerelle CQP/BTS → licence pro). Les établissements vivent dans `etablissements` (cycle « superieur ») :
 * aucune table miroir. Le `parcours` existant (type « universitaire »…) reste l'épine dorsale du suivi.
 */

/** Filière d'une école/université/CFP : offre de formation avec ses conditions d'accès lisibles. */
export const filiereSuperieure = core.table("filiere_superieure", {
  id: text("id").primaryKey(),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  nom: text("nom").notNull(),
  domaine: text("domaine", { enum: ["sciences_exactes", "sciences_vie_sante", "sciences_technologie", "agronomie", "droit_economie_gestion", "lettres_arts_sc_humaines", "sciences_education", "metier"] }).notNull(),
  voie: text("voie", { enum: ["scolaire", "technique", "professionnel", "universitaire", "apprentissage", "formation_courte", "alphabetisation"] }).notNull(),
  /** null pour une filière EFTP hors LMD (CAP, BT, BTS…). */
  cycle: text("cycle", { enum: ["licence", "master", "doctorat"] }),
  diplomeVise: text("diplome_vise", { enum: DIPLOMES }).notNull(),
  /** Composantes effectivement ouvertes (L1…Dr). Liste ouverte, verrouillée à l'arrêté au seed. */
  composantes: text("composantes").array().notNull().default(sql`'{}'::text[]`),
  creditsEcts: integer("credits_ects").notNull().default(0),
  capaciteAnnuelle: integer("capacite_annuelle"),
  /**
   * Places déclarées composante par composante. Sans cette ventilation, une L1 saturée et un M2 vide
   * se ressemblent dans les statistiques : `capaciteAnnuelle` reste le total déclaré, elle ne le remplace pas.
   */
  capaciteParComposante: jsonb("capacite_par_composante").$type<{ composante: string; places: number }[]>().notNull().default(sql`'[]'::jsonb`),
  serieBacRequise: text("serie_bac_requise").array().notNull().default(sql`'{}'::text[]`),
  accesConcours: boolean("acces_concours").notNull().default(false),
  /** Durée cumulée de(s) stage(s) obligatoire(s), en mois ; 0 si aucun. */
  stageObligatoireMois: integer("stage_obligatoire_mois").notNull().default(0),
  /** Matières du secondaire qui éclairent l'orientation, et leur poids (somme 1) — miroir du contrat `Filiere`. */
  criteresOrientation: jsonb("criteres_orientation").$type<{ matiere: string; poids: number }[]>().notNull().default(sql`'[]'::jsonb`),
  ...validite(),
}, (t) => [index("filiere_superieure_etablissement_idx").on(t.etablissementId), index("filiere_superieure_domaine_idx").on(t.domaine)]);

/** Session de concours sélectif rattachée à une filière. Une ligne par (filière, session). */
export const concoursSession = core.table("concours_session", {
  id: text("id").primaryKey(),
  nom: text("nom").notNull(),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  session: text("session").notNull(),
  statut: text("statut", { enum: ["annonce", "inscriptions", "admissibilite", "ecrits", "oraux", "resultats", "clos"] }).notNull().default("annonce"),
  diplomeRequis: text("diplome_requis", { enum: DIPLOMES }).notNull(),
  serieRequise: text("serie_requise").array().notNull().default(sql`'{}'::text[]`),
  places: integer("places"),
  epreuves: jsonb("epreuves").$type<{ matiere: string; coef: number }[]>().notNull().default(sql`'[]'::jsonb`),
  ouvertureLe: date("ouverture_le"),
  clotureLe: date("cloture_le"),
  epreuvesLe: date("epreuves_le"),
}, (t) => [uniqueIndex("concours_session_filiere_session_uq").on(t.filiereId, t.session), index("concours_session_statut_idx").on(t.statut)]);

/** Vœu d'orientation supérieur déposé par un apprenant. Un vœu ≠ une inscription. */
export const voeuSuperieur = core.table("voeu_superieur", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  /** Si le cycle est sélectif, le vœu précise le concours visé. */
  concoursId: text("concours_id").references(() => concoursSession.id),
  rang: integer("rang").notNull(),
  statut: text("statut", { enum: ["brouillon", "soumis", "admissible", "admis", "refuse", "desiste"] }).notNull().default("brouillon"),
  anneeScolaire: text("annee_scolaire").notNull(),
  /**
   * Une admission doit être datée et attribuée : sans ces deux colonnes, « admis » sort de nulle part
   * et ne peut être contesté ni audité. null tant que le vœu n'est pas statué.
   */
  decidePar: text("decide_par"),
  decideLe: date("decide_le"),
}, (t) => [
  uniqueIndex("voeu_superieur_apprenant_filiere_annee_uq").on(t.apprenantId, t.filiereId, t.anneeScolaire),
  index("voeu_superieur_apprenant_idx").on(t.apprenantId, t.anneeScolaire),
]);

/** Stage rattaché à un apprenant du supérieur (transversal L3/M2/licence pro/écoles/CFP). */
export const stage = core.table("stage", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  /** Filière d'origine du stage : sans elle, aucune statistique de stage par filière n'est possible. */
  filiereId: text("filiere_id").references(() => filiereSuperieure.id),
  entreprise: text("entreprise").notNull(),
  tuteurPro: text("tuteur_pro"),
  /** Enseignant BEILE assurant l'encadrement académique ; null si non encadré par BEILE. */
  tuteurAcademiqueId: text("tuteur_academique_id").references(() => enseignants.id),
  du: date("du"),
  au: date("au"),
  statut: text("statut", { enum: ["recherche", "piste", "convention_en_cours", "signe", "en_cours", "termine", "interrompu"] }).notNull().default("recherche"),
  valideParEtablissement: boolean("valide_par_etablissement").notNull().default(false),
}, (t) => [index("stage_apprenant_idx").on(t.apprenantId), index("stage_statut_idx").on(t.statut), index("stage_filiere_idx").on(t.filiereId), index("stage_etablissement_idx").on(t.etablissementId)]);

/* ------------------------------------------------------------------ Gestion des étudiants du supérieur
 * Miroir en base des contrats zod `packages/contracts/src/etudiants-superieur.ts` (T0). Doctrine :
 * BEILE tient l'identité de la personne, la certification du diplôme national et l'agrégation qui
 * permet au MESRS/MESTFP de piloter — pas la scolarité d'un établissement.
 *
 * `core.scolarites` ne peut pas servir de support ici : sa clé primaire est l'apprenant, donc une
 * seule ligne par personne. Le supérieur exige du multi-lignes (deux filières à la fois, césure,
 * transfert, redoublement partiel). D'où `inscriptions_superieures`. « Étudiant » n'est pas une
 * personne de plus : c'est ce statut d'inscription.
 */

/**
 * Période générique d'une filière : un S1, un T2, une année ou un module, tous sur la même forme.
 * Aucune colonne `semestre` et aucune branche conditionnelle : ajouter un rythme ne demande ni
 * migration ni code.
 */
export const periodes = core.table("periodes", {
  id: text("id").primaryKey(),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  /**
   * Année d'étude : une filière LMD déroule un S1 en L1 et un S1 en L2 la même année. Sans ce champ,
   * les deux porteraient le même nom. null pour une filière EFTP hors LMD.
   */
  composante: text("composante", { enum: COMPOSANTES }),
  type: text("type", { enum: TYPES_PERIODE }).notNull(),
  /** Rang de la période dans l'année universitaire. */
  numero: integer("numero").notNull(),
  intitule: text("intitule").notNull(),
  /** AAAA-AAAA. */
  anneeUniversitaire: text("annee_universitaire").notNull(),
  debut: date("debut"),
  fin: date("fin"),
  /** Crédits capitalisables sur la période (30 pour un semestre LMD standard). */
  creditsAttendus: integer("credits_attendus").notNull().default(0),
}, (t) => [
  // NULLS NOT DISTINCT : une filière EFTP hors LMD a sa période en `composante` null, et Postgres
  // exclurait sinon les nulls de l'unicité — deux « semestre 1 » identiques pourraient coexister.
  unique("periodes_filiere_annee_composante_type_numero_uq").on(t.filiereId, t.anneeUniversitaire, t.composante, t.type, t.numero).nullsNotDistinct(),
  index("periodes_annee_idx").on(t.anneeUniversitaire),
]);

/** UE du catalogue d'une filière : la brique de connaissance, indépendante de toute session. */
export const unitesEnseignement = core.table("unites_enseignement", {
  id: text("id").primaryKey(),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  code: text("code").notNull(),
  intitule: text("intitule").notNull(),
  type: text("type", { enum: ["obligatoire", "optionnelle", "libre", "transversale", "stage", "memoire"] }).notNull(),
  creditsEcts: integer("credits_ects").notNull(),
  /** Servi seulement par une règle de validation qui pondère par coefficient. */
  coefficient: doublePrecision("coefficient").notNull().default(1),
  /** Période-type où l'UE est normalement suivie ; null = au choix de l'étudiant (mineure, réorientation). */
  periodeType: text("periode_type", { enum: TYPES_PERIODE }),
  periodeNumero: integer("periode_numero"),
  /** Codes d'UE prérequises : un contrat peut être refusé si elles ne sont pas acquises. */
  prerequis: text("prerequis").array().notNull().default(sql`'{}'::text[]`),
}, (t) => [
  uniqueIndex("unites_enseignement_filiere_code_uq").on(t.filiereId, t.code),
  index("unites_enseignement_filiere_idx").on(t.filiereId),
]);

/**
 * Inscription d'une personne dans une filière pour une année universitaire — la promotion, niveau 1.
 * Volontairement PLUSIEURS lignes par apprenant : c'est la condition d'un transfert, d'une césure ou
 * d'une réorientation. L'unicité porte sur le quadruplet (personne, établissement, filière, année) :
 * un transfert crée une ligne chez le nouvel établissement, l'ancienne basculant `transfere_sorti`.
 */
export const inscriptionsSuperieures = core.table("inscriptions_superieures", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  /** null pour une filière EFTP hors LMD (CAP, BT, BTS, CQP). */
  composante: text("composante", { enum: COMPOSANTES }),
  anneeUniversitaire: text("annee_universitaire").notNull(),
  /** Le régime de l'établissement, tel qu'il l'a déclaré : la liberté est un fait enregistré. */
  regimePedagogique: text("regime_pedagogique", { enum: REGIMES }).notNull(),
  numeroEtudiant: text("numero_etudiant"),
  statut: text("statut", { enum: ["inscrit", "cesure", "redoublement_partiel", "abandon", "transfere_sorti", "diplome"] }).notNull(),
  /** Dimension de comptage national : un statut certifié, jamais un montant ni un échéancier. */
  statutCompte: text("statut_compte", { enum: STATUTS_COMPTE }).notNull().default("non_precise"),
  /** L'année n'est pas un bloc : en redoublement partiel on ne repasse que ces UE. Vide sinon. */
  ueNonAcquises: text("ue_non_acquises").array().notNull().default(sql`'{}'::text[]`),
  creditsAcquisCumules: integer("credits_acquis_cumules").notNull().default(0),
  inscriteLe: date("inscrite_le").notNull(),
}, (t) => [
  uniqueIndex("inscriptions_superieures_parcours_uq").on(t.apprenantId, t.etablissementId, t.filiereId, t.anneeUniversitaire),
  index("inscriptions_superieures_apprenant_idx").on(t.apprenantId, t.anneeUniversitaire),
  index("inscriptions_superieures_etablissement_idx").on(t.etablissementId, t.statut),
  index("inscriptions_superieures_filiere_idx").on(t.filiereId, t.anneeUniversitaire),
]);

/** Occurrence réelle d'une UE enseignée dans une période, avec ses volumes horaires — niveau 2. */
export const offresUe = core.table("offres_ue", {
  id: text("id").primaryKey(),
  ueId: text("ue_id").notNull().references(() => unitesEnseignement.id),
  periodeId: text("periode_id").notNull().references(() => periodes.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  enseignantId: text("enseignant_id").references(() => enseignants.id),
  session: text("session", { enum: SESSIONS_EVALUATION }).notNull().default("normale"),
  volumeCm: integer("volume_cm").notNull().default(0),
  volumeTd: integer("volume_td").notNull().default(0),
  volumeTp: integer("volume_tp").notNull().default(0),
  /** Places offertes ; null = sans limite déclarée. Jamais une capacité inventée. */
  capacite: integer("capacite"),
}, (t) => [
  uniqueIndex("offres_ue_ue_periode_session_uq").on(t.ueId, t.periodeId, t.session),
  index("offres_ue_periode_idx").on(t.periodeId),
  index("offres_ue_etablissement_idx").on(t.etablissementId),
]);

/** Groupe de TD/TP : une instance d'une offre, jamais une entité libre — niveau 3. */
export const groupes = core.table("groupes", {
  id: text("id").primaryKey(),
  offreUeId: text("offre_ue_id").notNull().references(() => offresUe.id),
  type: text("type", { enum: ["cm", "td", "tp", "projet", "clinique", "atelier"] }).notNull(),
  intitule: text("intitule").notNull(),
  capacite: integer("capacite").notNull(),
  enseignantId: text("enseignant_id").references(() => enseignants.id),
  /** Créneau déclaré, pour détecter les chevauchements du contrat d'un étudiant ; null si inconnu. */
  creneau: text("creneau"),
}, (t) => [
  uniqueIndex("groupes_offre_type_intitule_uq").on(t.offreUeId, t.type, t.intitule),
  index("groupes_offre_idx").on(t.offreUeId),
]);

/**
 * Le contrat pédagogique signé : l'étudiant choisit ses UE, une ligne par offre. Daté, parce qu'un
 * parcours sans date de signature n'est pas auditable. Un refus porte son motif (prérequis,
 * chevauchement, capacité).
 */
export const inscriptionsUe = core.table("inscriptions_ue", {
  id: text("id").primaryKey(),
  inscriptionSuperieureId: text("inscription_superieure_id").notNull().references(() => inscriptionsSuperieures.id),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  offreUeId: text("offre_ue_id").notNull().references(() => offresUe.id),
  /** Groupe retenu ; null pour une UE sans groupe. */
  groupeId: text("groupe_id").references(() => groupes.id),
  statut: text("statut", { enum: ["proposee", "signee", "abandonnee", "validee", "non_validee"] }).notNull().default("proposee"),
  signeeLe: date("signee_le"),
  motifRefus: text("motif_refus"),
}, (t) => [
  uniqueIndex("inscriptions_ue_inscription_offre_uq").on(t.inscriptionSuperieureId, t.offreUeId),
  index("inscriptions_ue_apprenant_idx").on(t.apprenantId, t.statut),
  index("inscriptions_ue_offre_idx").on(t.offreUeId),
]);

/**
 * Notes effectives d'UE (projection d'`EVALUATION_UE`, même forme que `core.notes`) : une ligne par
 * évaluation, la correction la plus récente appliquée. Elle vit séparément de `validations_ue` parce
 * qu'une UE notée peut n'être ni acquise ni compensée — confondre les deux effacerait les ajournés.
 */
export const notesUe = core.table("notes_ue", {
  evenementId: text("evenement_id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  offreUeId: text("offre_ue_id").notNull().references(() => offresUe.id),
  ueId: text("ue_id").notNull().references(() => unitesEnseignement.id),
  session: text("session", { enum: SESSIONS_EVALUATION }).notNull(),
  note: doublePrecision("note").notNull(),
  creditsEcts: integer("credits_ects").notNull(),
  coefficient: doublePrecision("coefficient").notNull(),
  survenuLe: timestamp("survenu_le", { withTimezone: true }).notNull(),
}, (t) => [index("notes_ue_apprenant_idx").on(t.apprenantId, t.ueId, t.survenuLe), index("notes_ue_offre_idx").on(t.offreUeId)]);

/**
 * Les huit paramètres de décision d'une validation, en vocabulaire fermé. C'est là que tient toute la
 * liberté d'un établissement : rien d'autre n'est paramétrable, et le JSON arbitraire est exclu.
 * Précédence `nationale < etablissement < filiere < periode` : la ligne la plus précise l'emporte EN
 * BLOC (toute colonne porte un défaut, « hérité » et « déclaré à la valeur par défaut » seraient
 * indistinguibles en base). Un établissement qui ne déclare rien hérite de la règle nationale.
 */
export const reglesValidation = core.table("regles_validation", {
  id: text("id").primaryKey(),
  portee: text("portee", { enum: ["nationale", "etablissement", "filiere", "periode"] }).notNull(),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  filiereId: text("filiere_id").references(() => filiereSuperieure.id),
  /** Portée `periode` : sans cette clé, une règle « de période » ne se distinguerait pas d'une règle de filière. */
  periodeId: text("periode_id").references(() => periodes.id),
  /** null = tous les régimes de la portée. */
  regime: text("regime", { enum: REGIMES }),
  /** 1. Seuil d'acquisition d'une UE, sur 20. */
  seuilAcquisition: doublePrecision("seuil_acquisition").notNull().default(10),
  /** 2. Note éliminatoire : sous ce seuil, aucune compensation ne rachète l'UE. null = aucune. */
  noteEliminatoire: doublePrecision("note_eliminatoire"),
  /** 3. Périmètre de la compensation entre UE ; `par_bloc` s'appuie sur `blocs`. */
  compensation: text("compensation", { enum: ["aucune", "entre_toutes_les_ue", "par_bloc"] }).notNull().default("par_bloc"),
  /** 4. Pondération de la moyenne. */
  ponderation: text("ponderation", { enum: ["ects", "coefficient", "ects_puis_coefficient"] }).notNull().default("ects"),
  /** 5. Note retenue quand une UE est repassée. */
  sessionRetenue: text("session_retenue", { enum: ["meilleure", "derniere"] }).notNull().default("meilleure"),
  /** 6. Moyenne minimale de période ouvrant la compensation ; null = aucune condition de moyenne. */
  seuilMoyennePeriode: doublePrecision("seuil_moyenne_periode"),
  /** 7. Durée de validité d'un acquis, en années. Au-delà, l'acquis doit être revalidé. */
  dureeValiditeAcquis: integer("duree_validite_acquis").notNull().default(5),
  /** 8. Report des crédits acquis vers une autre filière homologuée. */
  reportCreditsInterEtab: boolean("report_credits_inter_etab").notNull().default(true),
  /** Forme du paramètre 3 quand la compensation est « par bloc » : des listes de codes d'UE. */
  blocs: jsonb("blocs").$type<{ code: string; ue: string[] }[]>().notNull().default(sql`'[]'::jsonb`),
}, (t) => [
  index("regles_validation_portee_idx").on(t.portee, t.etablissementId, t.filiereId, t.periodeId),
  // Une seule règle par périmètre exact : sans elle, la règle appliquée dépendrait de l'ordre physique.
  unique("regles_validation_perimetre_uq").on(t.portee, t.etablissementId, t.filiereId, t.periodeId, t.regime).nullsNotDistinct(),
]);

/**
 * Crédit ECTS acquis : la ligne qui répond à « pourquoi cette UE est-elle acquise ? ». Un crédit
 * acquis est définitif et transférable — la projection ne le recalcule JAMAIS à la lecture. Aucune
 * contrainte d'unicité sur (apprenant, UE) : un acquis périmé selon la règle 7 peut être revalidé,
 * et la seconde acquisition doit rester lisible.
 */
export const validationsUe = core.table("validations_ue", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  ueId: text("ue_id").notNull().references(() => unitesEnseignement.id),
  /** null quand l'acquisition ne provient d'aucune offre (VAE, équivalence, acquis antérieur). */
  offreUeId: text("offre_ue_id").references(() => offresUe.id),
  periodeId: text("periode_id").references(() => periodes.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  voie: text("voie", { enum: ["note_session", "compensation", "acquis_anterieur", "vae", "equivalence", "decision_jury"] }).notNull(),
  /** Une UE s'acquiert en bloc, jamais au prorata. */
  creditsAcquis: integer("credits_acquis").notNull(),
  moyenne: doublePrecision("moyenne"),
  session: text("session", { enum: SESSIONS_EVALUATION }).notNull().default("hors_session"),
  regleValidationId: text("regle_validation_id").notNull().references(() => reglesValidation.id),
  justification: text("justification").notNull(),
  acquiseLe: date("acquise_le").notNull(),
  definitive: boolean("definitive").notNull().default(true),
  /** Fait du registre à l'origine de l'acquisition : la chaîne de preuve. */
  evenementId: text("evenement_id"),
}, (t) => [
  index("validations_ue_apprenant_idx").on(t.apprenantId, t.ueId),
  index("validations_ue_etablissement_idx").on(t.etablissementId, t.acquiseLe),
  index("validations_ue_periode_idx").on(t.periodeId),
  // Barrière en base contre le double acquis (double clic, rejeu concurrent) : une UE s'acquiert une
  // fois par période. Une revalidation après péremption (règle 7) se fait sur une autre période ; une
  // acquisition hors période (VAE, équivalence) une seule fois — NULLS NOT DISTINCT.
  unique("validations_ue_apprenant_ue_periode_uq").on(t.apprenantId, t.ueId, t.periodeId).nullsNotDistinct(),
]);

/**
 * Reconnaissance d'un acquis antérieur : la passerelle CQP/BTS → licence pro en dépend. Qui statue
 * n'est pas libre — l'équivalence des diplômes est aussi une charge de l'État (`DCE`, MESRS), et une
 * équivalence statuée doit nommer son décideur.
 */
export const equivalences = core.table("equivalences", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  ueId: text("ue_id").notNull().references(() => unitesEnseignement.id),
  titreOrigine: text("titre_origine").notNull(),
  etablissementOrigine: text("etablissement_origine"),
  anneeOrigine: text("annee_origine"),
  creditsReconnus: integer("credits_reconnus").notNull().default(0),
  statut: text("statut", { enum: ["demandee", "accordee", "refusee", "retiree"] }).notNull().default("demandee"),
  autorite: text("autorite", { enum: ["etablissement", "nationale"] }).notNull().default("etablissement"),
  motif: text("motif").notNull(),
  decidePar: text("decide_par"),
  decideLe: date("decide_le"),
}, (t) => [index("equivalences_apprenant_idx").on(t.apprenantId, t.statut), index("equivalences_statut_idx").on(t.statut, t.autorite), index("equivalences_etablissement_idx").on(t.etablissementId)]);

/**
 * Cycle d'un établissement privé d'enseignement supérieur (EPES), tel que le catalogue des services
 * publics de l'État le décrit : autorisation de création → autorisation d'ouverture (arrêté du
 * ministre après avis du CCNES, valable deux ans renouvelable une fois) → agrément. Une ligne par
 * (établissement, autorité de tutelle), parce qu'un EPES peut relever de deux tutelles.
 * Décret 2008-818 ; arrêté 2014 n°350/MESRS/CAB/DC/SGM/DGES/DEPES/SA.
 */
export const cyclesEpes = core.table("cycles_epes", {
  id: text("id").primaryKey(),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  autorite: text("autorite", { enum: TUTELLES }).notNull(),
  phase: text("phase", { enum: ["creation_sollicitee", "autorisation_de_creation", "autorisation_ouverture", "agrement", "refuse", "suspendu", "retire"] }).notNull(),
  /** À `instruit` correspond une demande en cours ; les autres statuts qualifient la phase courante. */
  statut: text("statut", { enum: ["instruit", "accorde", "refuse", "suspendu", "retire", "expire"] }).notNull().default("instruit"),
  /** Avis de l'instance consultative : obligatoire pour autoriser l'ouverture, jamais implicite. */
  avisConseil: text("avis_conseil", { enum: ["favorable", "defavorable", "non_demande"] }).notNull().default("non_demande"),
  /** Référence de l'acte (arrêté), telle qu'elle doit pouvoir être opposée à un tiers. */
  acteReference: text("acte_reference"),
  accordeLe: date("accorde_le"),
  echeanceLe: date("echeance_le"),
  renouvellements: integer("renouvellements").notNull().default(0),
  motif: text("motif"),
}, (t) => [
  uniqueIndex("cycles_epes_etablissement_autorite_uq").on(t.etablissementId, t.autorite),
  index("cycles_epes_echeance_idx").on(t.echeanceLe, t.phase),
]);

/**
 * Homologation d'un couple (établissement, filière) à délivrer un diplôme national — le principal
 * contrôle anti-fraude de BEILE : une école agréée peut ouvrir une filière qui ne l'est pas, et sans
 * homologation en cours le diplôme n'est pas opposable. `quotaAnnuel` est le plafond déclaré
 * d'inscriptions ; null quand aucun plafond n'est publié, jamais un chiffre inventé.
 */
export const homologationsFiliere = core.table("homologations_filiere", {
  id: text("id").primaryKey(),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  diplome: text("diplome", { enum: DIPLOMES }).notNull(),
  statut: text("statut", { enum: ["instruite", "accordee", "refusee", "suspendue", "retiree", "expiree"] }).notNull().default("instruite"),
  quotaAnnuel: integer("quota_annuel"),
  accordeeLe: date("accordee_le"),
  echeanceLe: date("echeance_le"),
  dernierControleLe: date("dernier_controle_le"),
  conclusionControle: text("conclusion_controle", { enum: ["conforme", "reserve", "non_conforme", "non_controle"] }).notNull().default("non_controle"),
  motif: text("motif"),
}, (t) => [
  uniqueIndex("homologations_filiere_etablissement_filiere_uq").on(t.etablissementId, t.filiereId),
  index("homologations_filiere_echeance_idx").on(t.echeanceLe, t.statut),
]);

/**
 * Jury : national pour un examen, d'établissement pour un diplôme par capitalisation. Les autorités
 * coexistent au Bénin (DEC du MEMP, DEC du MESTFP, DEC du supérieur pour les examens nationaux,
 * université pour la capitalisation) : `autorite` est un choix, pas une déduction. La colonne est un
 * texte sans contrainte — `office_du_bac` y reste LISIBLE pour relire une écriture ancienne, alors
 * qu'aucune nouvelle délibération ne l'emploie (référentiel §9).
 */
export const jurys = core.table("jurys", {
  id: text("id").primaryKey(),
  autorite: text("autorite", { enum: ["examen_national", "jury_capitalisation"] }).notNull(),
  office: text("office", { enum: OFFICES_DELIBERANTS }),
  /**
   * Session officielle pour un examen national ; null pour un jury d'établissement. Clé étrangère :
   * `core.examens_sessions` qualifie désormais aussi les examens nationaux du supérieur.
   */
  sessionExamenId: text("session_examen_id").references(() => examensSessions.id),
  filiereId: text("filiere_id").references(() => filiereSuperieure.id),
  periodeId: text("periode_id").references(() => periodes.id),
  diplome: text("diplome", { enum: DIPLOMES }).notNull(),
  president: text("president").notNull(),
  membres: text("membres").array().notNull().default(sql`'{}'::text[]`),
  /** Condition de validité de la délibération, pas une information décorative. */
  quorum: integer("quorum").notNull(),
  statut: text("statut", { enum: ["constitue", "reuni", "delibere", "publie"] }).notNull().default("constitue"),
  reuniLe: date("reuni_le"),
  /** Référence du procès-verbal papier : l'acte signé reste la source, BEILE en tient la trace. */
  pvReference: text("pv_reference"),
}, (t) => [index("jurys_diplome_statut_idx").on(t.diplome, t.statut), index("jurys_periode_idx").on(t.periodeId), index("jurys_filiere_idx").on(t.filiereId)]);

/** Décision d'un jury portant sur un diplôme national, avant émission du certificat. */
export const deliberationsDiplome = core.table("deliberations_diplome", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  juryId: text("jury_id").notNull().references(() => jurys.id),
  etablissementId: text("etablissement_id").notNull().references(() => etablissements.id),
  filiereId: text("filiere_id").notNull().references(() => filiereSuperieure.id),
  diplome: text("diplome", { enum: DIPLOMES }).notNull(),
  decision: text("decision", { enum: ["admis", "admis_sous_reserve", "ajourne", "refuse"] }).notNull(),
  creditsValides: integer("credits_valides").notNull().default(0),
  creditsRequis: integer("credits_requis").notNull().default(0),
  moyenneGenerale: doublePrecision("moyenne_generale"),
  mention: text("mention", { enum: ["Très bien", "Bien", "Assez bien", "Passable"] }),
  /** Ce qui manque. Sans cela, un ajournement n'est pas contestable. */
  ueManquantes: text("ue_manquantes").array().notNull().default(sql`'{}'::text[]`),
  delibereLe: date("delibere_le").notNull(),
  /**
   * Certificat émis par la certification ; null tant qu'aucun diplôme n'a été scellé (une décision
   * d'ajournement, d'admission sous réserve ou d'une filière hors porte n'en produit pas). La clé
   * étrangère tient depuis que `core.certificats.examen` admet les codes du supérieur : une délibération
   * qui annonce un certificat doit en désigner un qui existe, sinon le service public de vérification
   * renverrait « introuvable » sur un diplôme que l'écran affirme délivré.
   */
  certificatId: text("certificat_id").references(() => certificats.id),
}, (t) => [
  uniqueIndex("deliberations_diplome_apprenant_jury_uq").on(t.apprenantId, t.juryId),
  index("deliberations_diplome_apprenant_idx").on(t.apprenantId, t.delibereLe),
  index("deliberations_diplome_decision_idx").on(t.decision, t.delibereLe),
  index("deliberations_diplome_etablissement_idx").on(t.etablissementId, t.delibereLe),
]);

/* ------------------------------------------------------------------ Guichet de l'étudiant et allocations
 * La délivrance d'un acte est un processus daté, pas une case d'un écran : sans demande, sans mise à
 * disposition et sans remise horodatées, personne ne peut dire qui retarde. Les délais contractuels
 * sont copiés à la demande (`delaiContractuelJours`, `delaiSource`) : un barème qui bouge ne doit pas
 * réécrire l'historique jugé.
 *
 * Frontière acceptée le 2026-09-28 : le volet allocation tient un STATUT certifié (autorité, référence
 * d'arrêté, période), jamais une comptabilité. Aucune colonne de montant, d'échéancier ou de RIB — la
 * liquidation reste à la DBAU et au Trésor public.
 */

/**
 * Une demande d'acte, de bout en bout. Trois dates portent trois responsabilités distinctes :
 * `demandeeLe` (l'étudiant), `disponibleLe` (le guichet), `remisLe` (les deux). Les supprimer ou les
 * confondre rendrait tout contentieux impossible — et c'est le contentieux qui est la douleur.
 */
export const demandesActe = core.table("demandes_acte", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  typeActe: text("type_acte", { enum: TYPES_ACTE }).notNull(),
  autorite: text("autorite", { enum: AUTORITES_DELIVRANCE }).notNull(),
  anneeUniversitaire: text("annee_universitaire"),
  periodeId: text("periode_id").references(() => periodes.id),
  statut: text("statut", { enum: STATUTS_DEMANDE }).notNull().default("demandee"),
  /** Délai publié applicable au jour du dépôt, copié — pas une déduction du statut. */
  delaiContractuelJours: integer("delai_contractuel_jours").notNull(),
  delaiSource: text("delai_source").notNull(),
  /** Motif du demandeur. Exigée pour un duplicata : sans trace de perte, le duplicata est un second original. */
  motifDemande: text("motif_demande"),
  /** Un refus sans motif ne se conteste pas : il n'existe donc pas dans ce modèle. */
  motifRefus: text("motif_refus"),
  demandeeLe: date("demandee_le").notNull(),
  disponibleLe: date("disponible_le"),
  remisLe: date("remis_le"),
  modeRetrait: text("mode_retrait", { enum: MODES_RETRAIT }),
  piecePresentee: text("piece_presentee", { enum: PIECES_IDENTITE }),
  /** Nom du réceptionnaire quand ce n'est pas le titulaire (géniteur, mandataire, autorité académique). */
  remisA: text("remis_a"),
  /** Référence de quittance : une trace d'acquittement, jamais un montant. */
  referenceQuittance: text("reference_quittance"),
  /** Empreinte des champs signés : un tiers peut vérifier le document sans avoir de compte. */
  empreinte: text("empreinte"),
}, (t) => [
  index("demandes_acte_apprenant_idx").on(t.apprenantId, t.statut),
  index("demandes_acte_guichet_idx").on(t.etablissementId, t.typeActe, t.statut),
  index("demandes_acte_annee_idx").on(t.anneeUniversitaire, t.typeActe),
  // La file du guichet ne se double pas, même sous deux clics simultanés : une seule demande OUVERTE
  // par (étudiant, acte, année). Les demandes closes (remise, refusée, retirée) restent en historique.
  uniqueIndex("demandes_acte_ouverte_uq").on(t.apprenantId, t.typeActe, t.anneeUniversitaire)
    .where(sql`${t.statut} in ('demandee', 'en_instruction', 'disponible')`),
]);

/**
 * Échéance nationale de dépôt d'un dossier d'allocation. Une date d'administration est une donnée
 * déclarée par l'autorité, pas une constante de code : elle bouge chaque année.
 */
export const echeancesDepot = core.table("echeances_depot", {
  id: text("id").primaryKey(),
  anneeUniversitaire: text("annee_universitaire").notNull(),
  typeDecision: text("type_decision", { enum: TYPES_DECISION_ALLOCATION }).notNull(),
  dateLimite: date("date_limite").notNull(),
  /** Vocabulaire `TYPES_ACTE`, contrôlé par le contrat : le tableau reste un `text[]` simple. */
  actesExiges: text("actes_exiges").array().notNull().default(sql`'{}'::text[]`),
  autorite: text("autorite", { enum: ["dbau", "mesrs"] }).notNull(),
  intitule: text("intitule").notNull(),
}, (t) => [
  uniqueIndex("echeances_depot_annee_type_uq").on(t.anneeUniversitaire, t.typeDecision),
  index("echeances_depot_date_idx").on(t.dateLimite),
]);

/**
 * Décision de l'autorité sur une allocation, par année universitaire. La clé d'unicité porte le type de
 * décision : un rétablissement après une attribution retirée est un autre acte, pas un doublon.
 */
export const allocationsEtudiantes = core.table("allocations_etudiantes", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  etablissementId: text("etablissement_id").references(() => etablissements.id),
  anneeUniversitaire: text("annee_universitaire").notNull(),
  typeDecision: text("type_decision", { enum: TYPES_DECISION_ALLOCATION }).notNull(),
  statut: text("statut", { enum: STATUTS_COMPTE }).notNull(),
  autorite: text("autorite", { enum: ["dbau", "mesrs", "etablissement"] }).notNull(),
  referenceActe: text("reference_acte"),
  decideLe: date("decide_le").notNull(),
  echeanceId: text("echeance_id").references(() => echeancesDepot.id),
  motif: text("motif"),
}, (t) => [
  uniqueIndex("allocations_etudiantes_apprenant_annee_type_uq").on(t.apprenantId, t.anneeUniversitaire, t.typeDecision),
  index("allocations_etudiantes_annee_idx").on(t.anneeUniversitaire, t.statut),
  index("allocations_etudiantes_apprenant_idx").on(t.apprenantId, t.decideLe),
]);
