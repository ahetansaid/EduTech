import { sql } from "drizzle-orm";
import {
  boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgSchema, primaryKey, text, timestamp,
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
    enum: ["ecole_maternelle", "ecole_primaire", "college", "lycee_general", "lycee_technique", "centre_formation_professionnelle", "centre_alphabetisation", "universite", "ecole_superieure", "centre_examen"],
  }).notNull(),
  ministereTutelle: text("ministere_tutelle", { enum: ["MEMP", "MESTFP", "MESRS"] }).notNull(),
  cycle: text("cycle", { enum: ["primaire", "secondaire"] }).notNull(),
  statut: text("statut", { enum: ["public", "prive", "confessionnel", "communautaire"] }).notNull(),
  gestionnaire: text("gestionnaire"),
  agrement: text("agrement"),
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

export const certificats = core.table("certificats", {
  id: text("id").primaryKey(),
  apprenantId: text("apprenant_id").notNull().references(() => apprenants.id),
  examen: text("examen", { enum: ["CEP", "BEPC", "BAC"] }).notNull(),
  session: text("session").notNull(),
  mention: text("mention").notNull(),
  moyenne: numeric("moyenne", { precision: 4, scale: 2, mode: "number" }).notNull(),
  delivreLe: date("delivre_le").notNull(),
  empreinte: text("empreinte").notNull(),
  revoque: boolean("revoque").notNull().default(false),
});

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
  source: text("source", { enum: ["beile", "registre_national", "educmaster", "examens"] }).notNull(),
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
}, (t) => [index("sessions_compte_idx").on(t.compteId)]);

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
