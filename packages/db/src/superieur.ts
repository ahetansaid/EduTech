import { fileURLToPath } from "node:url";
import type { Habilitation } from "@beile/contracts";
import { empreinteCertificat } from "@beile/simulation/micro";
import { NOMS_NORD, NOMS_SUD, PRENOMS_F, PRENOMS_M } from "@beile/simulation/noms";
import { createRng } from "@beile/simulation/rng";
import { config } from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { connecter, schema } from "./index";

/**
 * Référentiel de l'enseignement supérieur : établissements, filières, concours, homologations, règle
 * nationale de validation, cycle d'un établissement privé — et une population d'étudiants bacheliers
 * avec les profils de connexion du volet supérieur.
 *
 * Doctrine : ce script ne pose que des DONNÉES DE RÉFÉRENCE (ce qu'un arrêté ou un annuaire publie) et
 * des personnes. Toute la vie de l'année (périodes, UE, inscriptions, notes, validations, jurys,
 * diplômes, actes, allocations) passe par l'API, donc par le registre et ses règles :
 * `npm run scenario:superieur -w @beile/api`.
 *
 * Les universités publiques et leurs composantes sont réelles ; les établissements marqués
 * « (démonstration) » sont fictifs. Places, quotas et dates de concours sont illustratifs.
 * Idempotent : identifiants stables, upserts.
 *   npm run superieur -w @beile/db
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const INFRA = { eau: true, electricite: true, internet: true, latrines: true, bibliotheque: true };
type Type = (typeof schema.etablissements.$inferInsert)["typeInstitution"];
type Tutelle = "MESRS" | "MESTFP" | "EMPLOI_PME";

/** [id, nom, sigle, type, statut, tutelles, commune, rattachement, lon, lat, capacité] */
const ETABLISSEMENTS: [string, string, string | null, Type, "public" | "prive", Tutelle[], string, string | null, number, number, number][] = [
  ["ETB-SUP-UAC", "Université d'Abomey-Calavi", "UAC", "universite", "public", ["MESRS"], "abomey-calavi", null, 2.3417, 6.4167, 90000],
  ["ETB-SUP-UP", "Université de Parakou", "UP", "universite", "public", ["MESRS"], "parakou", null, 2.6420, 9.3380, 25000],
  ["ETB-SUP-UNSTIM", "Université Nationale des Sciences, Technologies, Ingénierie et Mathématiques", "UNSTIM", "universite", "public", ["MESRS"], "abomey", null, 1.9912, 7.1829, 8000],
  ["ETB-SUP-UNA", "Université Nationale d'Agriculture", "UNA", "universite", "public", ["MESRS"], "porto-novo", null, 2.6289, 6.4969, 6000],
  ["ETB-SUP-UAC-FAST", "Faculté des Sciences et Techniques (UAC)", "FAST", "institut", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3431, 6.4172, 9000],
  ["ETB-SUP-UAC-FDSP", "Faculté de Droit et de Science Politique (UAC)", "FADESP", "institut", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3402, 6.4158, 15000],
  ["ETB-SUP-UAC-FASEG", "Faculté des Sciences Économiques et de Gestion (UAC)", "FASEG", "institut", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3395, 6.4181, 14000],
  ["ETB-SUP-UAC-FLLAC", "Faculté des Lettres, Langues, Arts et Communication (UAC)", "FLLAC", "institut", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3425, 6.4149, 12000],
  ["ETB-SUP-UAC-FSS", "Faculté des Sciences de la Santé (UAC)", "FSS", "institut", "public", ["MESRS"], "cotonou", "ETB-SUP-UAC", 2.4183, 6.3654, 3000],
  ["ETB-SUP-UAC-EPAC", "École Polytechnique d'Abomey-Calavi", "EPAC", "ecole_superieure", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3440, 6.4190, 4000],
  ["ETB-SUP-UAC-IFRI", "Institut de Formation et de Recherche en Informatique (UAC)", "IFRI", "institut", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3450, 6.4160, 1200],
  ["ETB-SUP-ENAM", "École Nationale d'Administration et de Magistrature", "ENAM", "ecole_nationale", "public", ["MESRS"], "abomey-calavi", "ETB-SUP-UAC", 2.3410, 6.4140, 1500],
  ["ETB-SUP-ENS-PN", "École Normale Supérieure de Porto-Novo", "ENS", "ecole_nationale", "public", ["MESRS"], "porto-novo", "ETB-SUP-UAC", 2.6150, 6.4900, 1500],
  ["ETB-SUP-CFP-PN", "Centre de formation professionnelle de Porto-Novo (démonstration)", "CFP-PN", "centre_formation_professionnelle", "public", ["MESTFP", "EMPLOI_PME"], "porto-novo", null, 2.6050, 6.4830, 600],
  ["ETB-SUP-ISP-PALMIERS", "Institut supérieur privé Les Palmiers (démonstration)", "ISP-LP", "ecole_superieure", "prive", ["MESRS"], "cotonou", null, 2.3920, 6.3700, 800],
];

type Critere = { matiere: string; poids: number };
type Filiere = typeof schema.filiereSuperieure.$inferInsert;
const cr = (...x: [string, number][]): Critere[] => x.map(([matiere, poids]) => ({ matiere, poids }));
const L = ["L1", "L2", "L3"];

/** Filières : l'offre publiée, avec ses conditions d'accès lisibles et ses critères d'orientation. */
const FILIERES: Filiere[] = [
  { id: "FIL-UAC-IFRI-L-INFO", etablissementId: "ETB-SUP-UAC-IFRI", nom: "Licence Informatique", domaine: "sciences_technologie", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: 360, capaciteParComposante: [{ composante: "L1", places: 150 }, { composante: "L2", places: 110 }, { composante: "L3", places: 100 }], serieBacRequise: ["C", "D", "E", "F"], accesConcours: false, stageObligatoireMois: 2, criteresOrientation: cr(["Mathématiques", 0.55], ["Sciences physiques", 0.3], ["Anglais", 0.15]) },
  { id: "FIL-UAC-IFRI-M-INFO", etablissementId: "ETB-SUP-UAC-IFRI", nom: "Master Informatique — Génie logiciel", domaine: "sciences_technologie", voie: "universitaire", cycle: "master", diplomeVise: "MASTER", composantes: ["M1", "M2"], creditsEcts: 120, capaciteAnnuelle: 80, serieBacRequise: [], accesConcours: false, stageObligatoireMois: 6, criteresOrientation: [] },
  { id: "FIL-UAC-FAST-L-MATHS", etablissementId: "ETB-SUP-UAC-FAST", nom: "Licence Mathématiques", domaine: "sciences_exactes", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["C", "D"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Mathématiques", 0.6], ["Sciences physiques", 0.25], ["SVT", 0.15]) },
  { id: "FIL-UAC-FAST-L-BIO", etablissementId: "ETB-SUP-UAC-FAST", nom: "Licence Sciences de la vie et de la Terre", domaine: "sciences_vie_sante", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["C", "D"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["SVT", 0.5], ["Sciences physiques", 0.3], ["Mathématiques", 0.2]) },
  { id: "FIL-UAC-FDSP-L-DROIT", etablissementId: "ETB-SUP-UAC-FDSP", nom: "Licence Droit", domaine: "droit_economie_gestion", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["A", "B", "C", "D", "G"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Français", 0.4], ["Histoire-Géographie", 0.35], ["Éducation civique", 0.25]) },
  { id: "FIL-UAC-FASEG-L-ECO", etablissementId: "ETB-SUP-UAC-FASEG", nom: "Licence Économie et Gestion", domaine: "droit_economie_gestion", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["B", "C", "D", "G"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Mathématiques", 0.4], ["Français", 0.3], ["Histoire-Géographie", 0.3]) },
  { id: "FIL-UAC-FLLAC-L-LETTRES", etablissementId: "ETB-SUP-UAC-FLLAC", nom: "Licence Lettres modernes", domaine: "lettres_arts_sc_humaines", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["A", "B"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Français", 0.55], ["Histoire-Géographie", 0.25], ["Anglais", 0.2]) },
  { id: "FIL-UAC-FSS-MED", etablissementId: "ETB-SUP-UAC-FSS", nom: "Doctorat en médecine", domaine: "sciences_vie_sante", voie: "universitaire", cycle: "doctorat", diplomeVise: "DOCTORAT", composantes: [], creditsEcts: 0, capaciteAnnuelle: null, serieBacRequise: ["C", "D"], accesConcours: true, stageObligatoireMois: 12, criteresOrientation: cr(["SVT", 0.45], ["Sciences physiques", 0.3], ["Mathématiques", 0.25]) },
  { id: "FIL-UAC-EPAC-L-GC", etablissementId: "ETB-SUP-UAC-EPAC", nom: "Licence professionnelle Génie civil", domaine: "sciences_technologie", voie: "technique", cycle: "licence", diplomeVise: "LICENCE_PRO", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["C", "D", "E", "F"], accesConcours: true, stageObligatoireMois: 3, criteresOrientation: cr(["Mathématiques", 0.5], ["Sciences physiques", 0.4], ["SVT", 0.1]) },
  { id: "FIL-ENAM-ADMIN", etablissementId: "ETB-SUP-ENAM", nom: "Administration générale (cycle II)", domaine: "droit_economie_gestion", voie: "universitaire", cycle: "master", diplomeVise: "MASTER", composantes: ["M1", "M2"], creditsEcts: 120, capaciteAnnuelle: null, serieBacRequise: [], accesConcours: true, stageObligatoireMois: 6, criteresOrientation: cr(["Français", 0.4], ["Histoire-Géographie", 0.3], ["Éducation civique", 0.3]) },
  { id: "FIL-ENS-PN-L-EDU", etablissementId: "ETB-SUP-ENS-PN", nom: "Licence Sciences de l'éducation (professorat)", domaine: "sciences_education", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["A", "C", "D"], accesConcours: true, stageObligatoireMois: 3, criteresOrientation: cr(["Français", 0.4], ["Mathématiques", 0.35], ["Éducation civique", 0.25]) },
  { id: "FIL-UP-L-DROIT", etablissementId: "ETB-SUP-UP", nom: "Licence Sciences juridiques", domaine: "droit_economie_gestion", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["A", "B", "C", "D", "G"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Français", 0.4], ["Histoire-Géographie", 0.35], ["Éducation civique", 0.25]) },
  { id: "FIL-UNSTIM-L-MATHS", etablissementId: "ETB-SUP-UNSTIM", nom: "Licence Mathématiques et applications", domaine: "sciences_exactes", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["C", "D", "E"], accesConcours: false, stageObligatoireMois: 0, criteresOrientation: cr(["Mathématiques", 0.65], ["Sciences physiques", 0.35]) },
  { id: "FIL-UNA-L-AGRO", etablissementId: "ETB-SUP-UNA", nom: "Licence Sciences agronomiques", domaine: "agronomie", voie: "universitaire", cycle: "licence", diplomeVise: "LICENCE", composantes: L, creditsEcts: 180, capaciteAnnuelle: null, serieBacRequise: ["C", "D"], accesConcours: false, stageObligatoireMois: 3, criteresOrientation: cr(["SVT", 0.5], ["Sciences physiques", 0.25], ["Mathématiques", 0.25]) },
  { id: "FIL-CFP-PN-BTS-MI", etablissementId: "ETB-SUP-CFP-PN", nom: "BTS Maintenance industrielle", domaine: "metier", voie: "professionnel", cycle: null, diplomeVise: "BTS", composantes: [], creditsEcts: 120, capaciteAnnuelle: 60, serieBacRequise: ["C", "D", "E", "F"], accesConcours: false, stageObligatoireMois: 5, criteresOrientation: cr(["Mathématiques", 0.4], ["Sciences physiques", 0.4], ["Anglais", 0.2]) },
  { id: "FIL-CFP-PN-BTS-CG", etablissementId: "ETB-SUP-CFP-PN", nom: "BTS Comptabilité et gestion", domaine: "droit_economie_gestion", voie: "professionnel", cycle: null, diplomeVise: "BTS", composantes: [], creditsEcts: 120, capaciteAnnuelle: 60, serieBacRequise: ["B", "G", "C", "D"], accesConcours: false, stageObligatoireMois: 4, criteresOrientation: cr(["Mathématiques", 0.4], ["Français", 0.3], ["Histoire-Géographie", 0.3]) },
  { id: "FIL-CFP-PN-CQP-ELEC", etablissementId: "ETB-SUP-CFP-PN", nom: "CQP Électricité du bâtiment", domaine: "metier", voie: "apprentissage", cycle: null, diplomeVise: "CQP", composantes: [], creditsEcts: 0, capaciteAnnuelle: 40, serieBacRequise: [], accesConcours: false, stageObligatoireMois: 6, criteresOrientation: [] },
  { id: "FIL-ISP-LP-ENR", etablissementId: "ETB-SUP-ISP-PALMIERS", nom: "Licence professionnelle Énergies renouvelables", domaine: "sciences_technologie", voie: "professionnel", cycle: "licence", diplomeVise: "LICENCE_PRO", composantes: L, creditsEcts: 180, capaciteAnnuelle: 90, serieBacRequise: ["C", "D", "E", "F"], accesConcours: false, stageObligatoireMois: 4, criteresOrientation: cr(["Sciences physiques", 0.4], ["Mathématiques", 0.4], ["SVT", 0.2]) },
];

type Concours = typeof schema.concoursSession.$inferInsert;
const CONCOURS: Concours[] = [
  { id: "CCS-2026-FSS-MED", nom: "Concours d'accès aux études médicales", filiereId: "FIL-UAC-FSS-MED", session: "2026", statut: "clos", diplomeRequis: "BAC", serieRequise: ["C", "D"], places: 350, epreuves: [{ matiere: "Sciences de la vie et de la Terre", coef: 4 }, { matiere: "Sciences physiques", coef: 3 }, { matiere: "Mathématiques", coef: 3 }, { matiere: "Français", coef: 1 }], ouvertureLe: "2026-07-01", clotureLe: "2026-08-10", epreuvesLe: "2026-08-29" },
  { id: "CCS-2026-EPAC-GC", nom: "Concours d'entrée EPAC — Génie civil", filiereId: "FIL-UAC-EPAC-L-GC", session: "2026", statut: "resultats", diplomeRequis: "BAC", serieRequise: ["C", "D", "E", "F"], places: 90, epreuves: [{ matiere: "Mathématiques", coef: 4 }, { matiere: "Sciences physiques", coef: 4 }, { matiere: "Dessin technique", coef: 2 }], ouvertureLe: "2026-07-06", clotureLe: "2026-08-07", epreuvesLe: "2026-08-22" },
  { id: "CCS-2026-ENS-EDU", nom: "Concours d'entrée ENS — professorat", filiereId: "FIL-ENS-PN-L-EDU", session: "2026", statut: "resultats", diplomeRequis: "BAC", serieRequise: ["A", "C", "D"], places: 120, epreuves: [{ matiere: "Dissertation", coef: 4 }, { matiere: "Mathématiques", coef: 3 }, { matiere: "Culture générale", coef: 2 }], ouvertureLe: "2026-07-10", clotureLe: "2026-08-14", epreuvesLe: "2026-09-05" },
  { id: "CCS-2027-ENAM-ADMIN", nom: "Concours d'entrée ENAM — cycle II", filiereId: "FIL-ENAM-ADMIN", session: "2027", statut: "annonce", diplomeRequis: "LICENCE", serieRequise: [], places: 60, epreuves: [{ matiere: "Culture générale", coef: 5 }, { matiere: "Droit public", coef: 3 }, { matiere: "Économie", coef: 3 }], ouvertureLe: "2027-04-15", clotureLe: "2027-05-31", epreuvesLe: "2027-06-26" },
  { id: "CCS-2027-FSS-MED", nom: "Concours d'accès aux études médicales", filiereId: "FIL-UAC-FSS-MED", session: "2027", statut: "annonce", diplomeRequis: "BAC", serieRequise: ["C", "D"], places: 350, epreuves: [{ matiere: "Sciences de la vie et de la Terre", coef: 4 }, { matiere: "Sciences physiques", coef: 3 }, { matiere: "Mathématiques", coef: 3 }, { matiere: "Français", coef: 1 }], ouvertureLe: "2027-07-01", clotureLe: "2027-08-10", epreuvesLe: "2027-08-28" },
];

/** Étudiants : cohortes de la Licence Informatique de l'IFRI (L1, L2, L3) et de la promotion diplômée. */
export const COHORTES = { L1: 16, L2: 14, L3: 14, diplomes: 16 } as const;
export const ID_PREMIER_ETUDIANT = 900001;
const NB_ETUDIANTS = COHORTES.L1 + COHORTES.L2 + COHORTES.L3 + COHORTES.diplomes;
export const idEtudiant = (i: number) => `APP-${String(ID_PREMIER_ETUDIANT + i)}`;

const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
try {
  const debut = Date.now();
  const t = schema;
  await db.transaction(async (tx) => {
    /* -- Établissements du supérieur */
    for (const [id, nom, sigle, type, statut, tutelles, communeId, rattachementId, lon, lat, capacite] of ETABLISSEMENTS) {
      const valeurs = {
        nom, sigle, typeInstitution: type, ministereTutelle: tutelles.includes("MESRS") ? "MESRS" as const : "MESTFP" as const,
        cycle: "superieur" as const, statut, gestionnaire: statut === "prive" ? "Promoteur privé" : "État", tutelles, rattachementId, communeId,
        circonscription: `Supérieur · ${communeId}`, position: sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)` as unknown as string,
        capacite, sallesDeClasse: Math.max(4, Math.round(capacite / 80)), infrastructures: INFRA,
        effectifDeclare: Math.round(capacite * 0.85), enseignantsDeclares: Math.max(6, Math.round(capacite / 45)),
        agrement: statut === "prive" ? "Arrêté d'ouverture (démonstration)" : null,
      };
      // Parents d'abord : l'ordre du tableau place chaque université avant ses composantes.
      await tx.insert(t.etablissements).values({ id, ...valeurs }).onConflictDoUpdate({ target: t.etablissements.id, set: valeurs });
    }

    /* -- Filières, concours */
    for (const f of FILIERES) {
      const { id, ...valeurs } = f;
      await tx.insert(t.filiereSuperieure).values(f).onConflictDoUpdate({ target: t.filiereSuperieure.id, set: valeurs });
    }
    for (const c of CONCOURS) {
      const { id, ...valeurs } = c;
      await tx.insert(t.concoursSession).values(c).onConflictDoUpdate({ target: t.concoursSession.id, set: valeurs });
    }

    /* -- Homologations : les filières publiques sont habilitées ; celle du privé est encore instruite
       (la porte anti-fraude doit pouvoir refuser une certification). */
    for (const f of FILIERES) {
      const prive = f.etablissementId === "ETB-SUP-ISP-PALMIERS";
      const valeurs = {
        etablissementId: f.etablissementId, filiereId: f.id!, diplome: f.diplomeVise,
        statut: prive ? "instruite" as const : "accordee" as const,
        quotaAnnuel: null, accordeeLe: prive ? null : "2022-10-01", echeanceLe: prive ? null : "2027-09-30",
        dernierControleLe: prive ? null : "2025-06-15", conclusionControle: prive ? "non_controle" as const : "conforme" as const,
        motif: prive ? "Dossier en instruction (démonstration)" : "Habilitation à délivrer le diplôme national",
      };
      await tx.insert(t.homologationsFiliere).values({ id: `HMG-${f.id!.slice(4)}`, ...valeurs })
        .onConflictDoUpdate({ target: [t.homologationsFiliere.etablissementId, t.homologationsFiliere.filiereId], set: valeurs });
    }

    /* -- Cycle EPES de l'établissement privé : autorisation d'ouverture accordée, agrément à venir. */
    const epes = {
      phase: "autorisation_ouverture" as const, statut: "accorde" as const, avisConseil: "favorable" as const,
      acteReference: "Arrêté d'autorisation d'ouverture (démonstration)", accordeLe: "2025-09-01", echeanceLe: "2027-08-31", renouvellements: 0,
      motif: "Autorisation valable deux ans, renouvelable une fois",
    };
    await tx.insert(t.cyclesEpes).values({ id: "EPS-ISP-PALMIERS-MESRS", etablissementId: "ETB-SUP-ISP-PALMIERS", autorite: "MESRS", ...epes })
      .onConflictDoUpdate({ target: [t.cyclesEpes.etablissementId, t.cyclesEpes.autorite], set: epes });

    /* -- Règle nationale de validation (paramètres LMD usuels ; un établissement qui ne déclare rien en hérite). */
    const nationale = {
      portee: "nationale" as const, etablissementId: null, filiereId: null, periodeId: null, regime: null,
      seuilAcquisition: 10, noteEliminatoire: null, compensation: "entre_toutes_les_ue" as const, ponderation: "ects" as const,
      sessionRetenue: "meilleure" as const, seuilMoyennePeriode: 10, dureeValiditeAcquis: 5, reportCreditsInterEtab: true, blocs: [],
    };
    await tx.insert(t.reglesValidation).values({ id: "RGL-NATIONALE-LMD", ...nationale })
      .onConflictDoUpdate({ target: t.reglesValidation.id, set: nationale });

    /* -- Étudiants : une personne au registre national, un apprenant, un baccalauréat certifié. */
    const rng = createRng(2027);
    const existants = new Set((await tx.select({ id: t.apprenants.id }).from(t.apprenants)
      .where(inArray(t.apprenants.id, Array.from({ length: NB_ETUDIANTS }, (_, i) => idEtudiant(i))))).map((x) => x.id));
    for (let i = 0; i < NB_ETUDIANTS; i++) {
      const id = idEtudiant(i);
      const sexe = rng.bool(0.47) ? "F" as const : "M" as const;
      const nom = rng.bool(0.3) ? rng.pick(NOMS_NORD) : rng.pick(NOMS_SUD);
      const prenoms = sexe === "F" ? rng.pick(PRENOMS_F) : rng.pick(PRENOMS_M);
      // Âge cohérent avec la cohorte : bac obtenu l'été précédant la L1.
      const rangCohorte = i < COHORTES.L1 ? 0 : i < COHORTES.L1 + COHORTES.L2 ? 1 : i < COHORTES.L1 + COHORTES.L2 + COHORTES.L3 ? 2 : 3;
      const anneeBac = 2026 - rangCohorte;
      const naissance = `${anneeBac - 18 - rng.int(0, 2)}-${String(rng.int(1, 12)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`;
      const npi = `29${String(10_000_000 + ID_PREMIER_ETUDIANT + i).slice(-8)}`;
      if (existants.has(id)) continue;
      await tx.insert(t.personnes).values({ npi, nom, prenoms, dateNaissance: naissance, sexe, communeNaissanceId: rng.pick(["cotonou", "porto-novo", "abomey-calavi", "parakou", "abomey"]), parentsNpi: [] })
        .onConflictDoNothing();
      await tx.insert(t.apprenants).values({ id, npi, statutIdentite: "verifiee", nom, prenoms, dateNaissance: naissance, sexe });
      const moyenne = Math.round((10 + rng.float(0, 7)) * 100) / 100;
      const mention = moyenne >= 16 ? "Très bien" : moyenne >= 14 ? "Bien" : moyenne >= 12 ? "Assez bien" : "Passable";
      const bac = {
        id: `CERT-BAC-${anneeBac}-${id.slice(4)}`, apprenantId: id, examen: "BAC" as const, session: `Juin ${anneeBac}`, mention, moyenne,
        delivreLe: `${anneeBac}-07-25`, filiereId: null, etablissementId: null, office: null,
      };
      await tx.insert(t.certificats).values({ ...bac, empreinte: empreinteCertificat(bac, `${prenoms} ${nom}`), revoque: false });
      await tx.insert(t.parcours).values({ id: `PAR-SUP-${id.slice(4)}`, apprenantId: id, type: "universitaire", institutionId: "ETB-SUP-UAC-IFRI", intitule: "Licence Informatique", statut: rangCohorte === 3 ? "termine" : "en_cours", valideDu: `${anneeBac}-10-01` });
    }

    /* -- Enseignant-chercheur de l'IFRI (saisie des notes d'UE). */
    const enseignant = { npi: "2900000001", nom: "HOUNKPATIN", prenoms: "Sèna", sexe: "F" as const, matieres: ["Informatique"], etablissementId: "ETB-SUP-UAC-IFRI", grade: "Maître de conférences", dateRecrutement: "2012-10-01" };
    await tx.insert(t.personnes).values({ npi: enseignant.npi, nom: enseignant.nom, prenoms: enseignant.prenoms, dateNaissance: "1982-04-12", sexe: "F", communeNaissanceId: "cotonou", parentsNpi: [] }).onConflictDoNothing();
    await tx.insert(t.enseignants).values({ id: "ENS-SUP-0001", ...enseignant }).onConflictDoUpdate({ target: t.enseignants.id, set: enseignant });

    /* -- Profils de connexion du volet supérieur. */
    const [etudiante] = await tx.select().from(t.apprenants).where(inArray(t.apprenants.id, [idEtudiant(COHORTES.L1 + COHORTES.L2)]));
    const profils: { id: string; nomAffiche: string; fonction: string; npi: string | null; habilitations: Habilitation[] }[] = [
      { id: "p-directeur-ifri", nomAffiche: "Prosper AHOUANDJINOU", fonction: "Directeur de l'IFRI · Université d'Abomey-Calavi", npi: null, habilitations: [{ role: "chef_etablissement", perimetre: { niveau: "etablissement", etablissementId: "ETB-SUP-UAC-IFRI" } }] },
      { id: "p-enseignant-sup", nomAffiche: `${enseignant.prenoms} ${enseignant.nom}`, fonction: "Maîtresse de conférences · IFRI (UAC)", npi: enseignant.npi, habilitations: [{ role: "enseignant", perimetre: { niveau: "etablissement", etablissementId: "ETB-SUP-UAC-IFRI" } }] },
      { id: "p-etudiant", nomAffiche: `${etudiante!.prenoms} ${etudiante!.nom}`, fonction: "Étudiant·e en L3 Informatique · IFRI (UAC)", npi: etudiante!.npi, habilitations: [{ role: "apprenant", perimetre: { niveau: "personnel", apprenantId: etudiante!.id } }] },
    ];
    for (const p of profils) {
      const { id, ...valeurs } = p;
      await tx.insert(t.profils).values(p).onConflictDoUpdate({ target: t.profils.id, set: valeurs });
    }
  });

  const [n] = (await db.execute(sql`select
      (select count(*)::int from core.etablissements where cycle = 'superieur') etab,
      (select count(*)::int from core.filiere_superieure) fil,
      (select count(*)::int from core.concours_session) conc,
      (select count(*)::int from core.homologations_filiere) hmg,
      (select count(*)::int from core.apprenants where id >= ${idEtudiant(0)}) etu`)) as unknown as { etab: number; fil: number; conc: number; hmg: number; etu: number }[];
  console.log(`Référentiel du supérieur prêt en ${Date.now() - debut} ms : ${n?.etab} établissements, ${n?.fil} filières, ${n?.conc} concours, ${n?.hmg} homologations, ${n?.etu} étudiants.`);
} finally {
  await client.end();
}
