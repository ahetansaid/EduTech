import { Session } from "./client-recette";

/**
 * Scénario de l'enseignement supérieur, joué PAR L'API avec de vrais comptes : la vie de la Licence
 * Informatique de l'IFRI (UAC) sur quatre cohortes d'entrée (2023 → 2026).
 *
 *   direction de l'IFRI  → périodes, maquette d'UE, offres, inscriptions, contrats, validations, jury, délibération
 *   enseignante          → notes d'UE
 *   bureau du supérieur  → échéances de dépôt, allocations
 *   étudiant·e           → contrat d'UE optionnelle, demandes d'acte, stage
 *
 * Tout passe par le registre et ses règles (plafonds, prérequis, règle de validation en vigueur,
 * homologation, sceau du diplôme) : ce que les écrans affichent ensuite est ce que la production
 * aurait produit. Rejouable : les créations sont des upserts et les saisies portent un `idSaisie`
 * déterministe ; un rejeu ne double rien.
 *
 * Prérequis : `npm run superieur -w @beile/db` puis `npm run comptes -w @beile/db`, API démarrée.
 *   npm run scenario:superieur -w @beile/api
 */

const IFRI = "ETB-SUP-UAC-IFRI";
const FILIERE = "FIL-UAC-IFRI-L-INFO";
const ENSEIGNANTE = "ENS-SUP-0001";
/** Miroir de `packages/db/src/superieur.ts` : L1 2026 (16), L2 (14), L3 (14), promotion diplômée (16). */
const COHORTES: { entree: number; effectif: number }[] = [
  { entree: 2026, effectif: 16 }, { entree: 2025, effectif: 14 }, { entree: 2024, effectif: 14 }, { entree: 2023, effectif: 16 },
];
const ANNEE_COURANTE = 2026;
const idEtudiant = (i: number) => `APP-${900001 + i}`;

let etapes = 0;
function exiger(libelle: string, r: { statut: number; json: unknown }, attendus: number[] = [200, 201]) {
  etapes++;
  if (!attendus.includes(r.statut)) {
    console.error(`✘ ${libelle} — HTTP ${r.statut} : ${JSON.stringify(r.json).slice(0, 400)}`);
    process.exit(1);
  }
  return r.json as Record<string, unknown>;
}
const annee = (debut: number) => `${debut}-${debut + 1}`;

/* ------------------------------------------------------------------ Maquette : 6 semestres × 30 crédits */

type UeMaquette = { code: string; intitule: string; credits: number; type: "obligatoire" | "optionnelle" | "stage"; prerequis?: string[] };
const MAQUETTE: Record<number, UeMaquette[]> = {
  1: [
    { code: "INF1101", intitule: "Algorithmique et programmation 1", credits: 8, type: "obligatoire" },
    { code: "INF1102", intitule: "Mathématiques pour l'informatique 1", credits: 6, type: "obligatoire" },
    { code: "INF1103", intitule: "Architecture des ordinateurs", credits: 6, type: "obligatoire" },
    { code: "INF1104", intitule: "Systèmes d'exploitation : initiation", credits: 5, type: "obligatoire" },
    { code: "INF1105", intitule: "Anglais scientifique et techniques d'expression", credits: 5, type: "obligatoire" },
  ],
  2: [
    { code: "INF1201", intitule: "Algorithmique et programmation 2", credits: 8, type: "obligatoire", prerequis: ["INF1101"] },
    { code: "INF1202", intitule: "Mathématiques pour l'informatique 2", credits: 6, type: "obligatoire" },
    { code: "INF1203", intitule: "Bases de données 1", credits: 6, type: "obligatoire" },
    { code: "INF1204", intitule: "Réseaux informatiques 1", credits: 5, type: "obligatoire" },
    { code: "INF1205", intitule: "Web : technologies du client", credits: 5, type: "obligatoire" },
  ],
  3: [
    { code: "INF2101", intitule: "Programmation orientée objet", credits: 8, type: "obligatoire" },
    { code: "INF2102", intitule: "Structures de données avancées", credits: 6, type: "obligatoire" },
    { code: "INF2103", intitule: "Probabilités et statistiques", credits: 6, type: "obligatoire" },
    { code: "INF2104", intitule: "Systèmes d'exploitation avancés", credits: 5, type: "obligatoire" },
    { code: "INF2105", intitule: "Anglais professionnel", credits: 5, type: "obligatoire" },
  ],
  4: [
    { code: "INF2201", intitule: "Génie logiciel", credits: 8, type: "obligatoire" },
    { code: "INF2202", intitule: "Bases de données 2", credits: 6, type: "obligatoire" },
    { code: "INF2203", intitule: "Réseaux informatiques 2", credits: 6, type: "obligatoire" },
    { code: "INF2204", intitule: "Développement web côté serveur", credits: 5, type: "obligatoire" },
    { code: "INF2205", intitule: "Recherche opérationnelle", credits: 5, type: "obligatoire" },
  ],
  5: [
    { code: "INF3101", intitule: "Compilation", credits: 8, type: "obligatoire" },
    { code: "INF3102", intitule: "Sécurité des systèmes d'information", credits: 6, type: "obligatoire" },
    { code: "INF3103", intitule: "Systèmes distribués", credits: 6, type: "obligatoire" },
    { code: "INF3104", intitule: "Intelligence artificielle : fondements", credits: 5, type: "obligatoire" },
    { code: "INF3105", intitule: "Développement mobile (option)", credits: 5, type: "optionnelle" },
  ],
  6: [
    { code: "INF3201", intitule: "Projet de fin de cycle", credits: 8, type: "obligatoire" },
    { code: "INF3202", intitule: "Gestion de projet informatique", credits: 6, type: "obligatoire" },
    { code: "INF3203", intitule: "Droit du numérique et protection des données", credits: 5, type: "obligatoire" },
    { code: "INF3204", intitule: "Entrepreneuriat numérique", credits: 5, type: "obligatoire" },
    { code: "INF3205", intitule: "Stage en entreprise (2 mois)", credits: 6, type: "obligatoire" },
  ],
};
const COMPOSANTE_DU_SEMESTRE = (s: number) => (["L1", "L1", "L2", "L2", "L3", "L3"] as const)[s - 1]!;
const DATES = (an: number, s: number) => (s % 2 === 1 ? [`${an}-10-05`, `${an + 1}-02-13`] : [`${an + 1}-02-22`, `${an + 1}-07-03`]);

/** Note déterministe, au quart de point : niveau de l'étudiant + difficulté de l'UE + aléa stable. */
function note(apprenantId: string, code: string, niveau: number) {
  let h = 2166136261;
  for (const ch of `${apprenantId}|${code}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const alea = ((h >>> 0) % 1000) / 1000 - 0.5; // −0,5 … +0,5
  const difficulte = code.endsWith("01") ? -0.8 : code.endsWith("05") ? 1 : 0;
  return Math.round(Math.min(19.5, Math.max(3, niveau + difficulte + alea * 5)) * 4) / 4;
}

/* ------------------------------------------------------------------ Connexions */

/**
 * Client poli : l'API plafonne chaque utilisateur (300 requêtes/min). Sur un 429, on attend et on
 * rejoue — la limite est une protection de production, le scénario ne la contourne pas.
 */
class SessionPatiente extends Session {
  override async appel(...args: Parameters<Session["appel"]>) {
    for (let essai = 0; ; essai++) {
      const r = await super.appel(...args);
      if (r.statut !== 429 || essai >= 8) return r;
      await new Promise((ok) => setTimeout(ok, 8000));
    }
  }
}

const connecte = async (identifiant: string) => {
  const s = new SessionPatiente();
  exiger(`Connexion ${identifiant}`, await s.connexion(identifiant));
  return s;
};
const [direction, enseignante, bureau, etudiant] = (await Promise.all(
  ["prosper.ahouandjinou", "sena.hounkpatin", "felicite.akakpo", "etudiant.ifri"].map(connecte),
)) as [Session, Session, Session, Session];
console.log("Connexions établies (direction IFRI, enseignante, bureau du supérieur, étudiant·e).");

/* ------------------------------------------------------------------ 1. Maquette d'UE */

const ues = new Map<string, { id: string; semestre: number } & UeMaquette>();
for (const [semestre, liste] of Object.entries(MAQUETTE)) {
  for (const u of liste) {
    const r = exiger(`UE ${u.code}`, await direction.appel("POST", `/etablissements/${IFRI}/unites-enseignement`, {
      filiereId: FILIERE, code: u.code, intitule: u.intitule, type: u.type, creditsEcts: u.credits,
      periodeType: "semestre", periodeNumero: Number(semestre), prerequis: u.prerequis ?? [],
    }));
    ues.set(u.code, { ...u, id: String(r.id), semestre: Number(semestre) });
  }
}
console.log(`Maquette : ${ues.size} UE sur 6 semestres (180 crédits).`);

/* ------------------------------------------------------------------ 2. Périodes et offres, 2023 → 2026 */

type Periode = { id: string; an: number; semestre: number };
const periodes: Periode[] = [];
const offres = new Map<string, string>(); // `${periodeId}|${code}` → offre
for (let an = 2023; an <= ANNEE_COURANTE; an++) {
  for (let semestre = 1; semestre <= 6; semestre++) {
    // Une composante n'est ouverte une année que si une cohorte y est : L1 dès 2023, L2 dès 2024, L3 dès 2025.
    const entree = an - Math.floor((semestre - 1) / 2);
    if (entree < 2023) continue;
    const [debut, fin] = DATES(an, semestre);
    const p = exiger(`Période S${semestre} ${annee(an)}`, await direction.appel("POST", `/etablissements/${IFRI}/periodes`, {
      filiereId: FILIERE, composante: COMPOSANTE_DU_SEMESTRE(semestre), type: "semestre", numero: semestre % 2 === 1 ? 1 : 2,
      intitule: `Semestre ${semestre}`, anneeUniversitaire: annee(an), debut, fin, creditsAttendus: 30,
    }));
    periodes.push({ id: String(p.id), an, semestre });
    for (const u of MAQUETTE[semestre]!) {
      const o = exiger(`Offre ${u.code} ${annee(an)}`, await direction.appel("POST", `/etablissements/${IFRI}/offres`, {
        ueId: ues.get(u.code)!.id, periodeId: p.id, enseignantId: ENSEIGNANTE, session: "normale",
        volumeCm: u.credits * 4, volumeTd: u.credits * 3, volumeTp: u.type === "stage" ? 0 : u.credits * 2, capacite: null,
      }));
      offres.set(`${p.id}|${u.code}`, String(o.id));
    }
  }
}
console.log(`${periodes.length} périodes et ${offres.size} offres d'UE déclarées.`);

/* ------------------------------------------------------------------ 3. Étudiants, inscriptions annuelles */

type Etudiant = { id: string; entree: number; niveau: number };
const etudiants: Etudiant[] = [];
let rang = 0;
for (const c of COHORTES) {
  for (let k = 0; k < c.effectif; k++, rang++) {
    // Niveaux étalés ; dans la promotion sortante, deux étudiants en difficulté (ajournés au jury).
    const niveau = c.entree === 2023 && k >= c.effectif - 2 ? 8.2 : 10.5 + ((k * 37) % 70) / 10;
    etudiants.push({ id: idEtudiant(rang), entree: c.entree, niveau });
  }
}
const STATUTS_COMPTE = ["boursier_integral", "demi_boursier", "payant", "payant", "non_precise"] as const;
let inscriptions = 0;
for (const e of etudiants) {
  for (let an = e.entree; an <= Math.min(ANNEE_COURANTE, e.entree + 2); an++) {
    const composante = (["L1", "L2", "L3"] as const)[an - e.entree]!;
    const r = await direction.appel("POST", `/etablissements/${IFRI}/inscriptions`, {
      apprenantId: e.id, filiereId: FILIERE, composante, anneeUniversitaire: annee(an), regimePedagogique: "semestriel",
      numeroEtudiant: `IFRI-${e.entree}-${e.id.slice(-3)}`, statutCompte: STATUTS_COMPTE[Number(e.id.slice(-1)) % STATUTS_COMPTE.length],
    });
    exiger(`Inscription ${e.id} ${composante} ${annee(an)}`, r, [201, 409]); // 409 : déjà inscrit (rejeu)
    if (r.statut === 201) inscriptions++;
  }
}
console.log(`${etudiants.length} étudiants ; ${inscriptions} inscription(s) annuelle(s) nouvelle(s).`);

/* ------------------------------------------------------------------ 4. Contrats pédagogiques */

let signes = 0;
for (const p of periodes) {
  const r = exiger(`Contrats obligatoires S${p.semestre} ${annee(p.an)}`, await direction.appel("POST", `/etablissements/${IFRI}/contrats/obligatoires`, {
    periodeId: p.id, idSaisie: `SCN-OBL-${p.id.slice(-20)}`,
  }));
  signes += Number(r.signes ?? 0);
}
// UE optionnelle du S5 : le choix appartient à l'étudiant, la direction signe. Les promotions passées
// l'ont suivie (contrat proposé puis signé par la direction, pour chacun) ; l'étudiant·e connecté·e la
// propose elle-même pour l'année en cours.
const inscriptionsIfri = (exiger("Liste des inscriptions", await direction.appel("GET", `/etablissements/${IFRI}/inscriptions?filiereId=${FILIERE}`)) as unknown as { inscription: { id: string; apprenantId: string; anneeUniversitaire: string; composante: string | null } }[])
  .map((l) => l.inscription);
const periodeS5 = (an: number) => periodes.find((p) => p.an === an && p.semestre === 5);
const s5Courant = periodeS5(ANNEE_COURANTE)!;
const offreOption = offres.get(`${s5Courant.id}|INF3105`)!;
// 201 : proposition enregistrée ; 409 : contrat déjà signé (rejeu du scénario).
const propose = exiger("L'étudiant·e propose l'UE optionnelle du S5", await etudiant.appel("POST", "/moi/contrat/ue", { offreUeId: offreOption, groupeId: null }), [201, 409]);
if (propose.inscriptionUeId) {
  exiger("La direction signe le contrat optionnel", await direction.appel("POST", `/etablissements/${IFRI}/contrat/ue`, {
    inscriptionUeId: propose.inscriptionUeId, statut: "signee", motifRefus: null,
  }));
}
console.log(`${signes} contrat(s) d'UE obligatoire signé(s) ; UE optionnelle proposée par l'étudiant·e et signée.`);

/* ------------------------------------------------------------------ 5. Notes (semestres achevés) puis validations */

const aujourdhui = new Date().toISOString().slice(0, 10);
const acheves = periodes.filter((p) => DATES(p.an, p.semestre)[1]! < aujourdhui);
let notes = 0, validations = 0;
for (const p of acheves) {
  const composante = COMPOSANTE_DU_SEMESTRE(p.semestre);
  const promo = inscriptionsIfri.filter((i) => i.anneeUniversitaire === annee(p.an) && i.composante === composante).map((i) => i.apprenantId);
  if (!promo.length) continue;
  for (const u of MAQUETTE[p.semestre]!) {
    if (u.type !== "obligatoire") continue; // l'optionnelle des promotions passées n'a pas été contractée
    const offreId = offres.get(`${p.id}|${u.code}`)!;
    const r = exiger(`Notes ${u.code} ${annee(p.an)}`, await enseignante.appel("POST", "/moi/enseignements/notes-ue", {
      offreUeId: offreId, idSaisie: `SCN-NOTE-${offreId.slice(-24)}`,
      notes: promo.map((a) => ({ apprenantId: a, note: note(a, u.code, etudiants.find((e) => e.id === a)!.niveau) })),
    }), [200, 201]);
    if (!r.deja) notes += promo.length;
  }
  const lignes = promo.flatMap((a) => MAQUETTE[p.semestre]!.filter((u) => u.type === "obligatoire").map((u) => ({ apprenantId: a, offreUeId: offres.get(`${p.id}|${u.code}`)! })));
  const v = exiger(`Validations S${p.semestre} ${annee(p.an)}`, await direction.appel("POST", `/etablissements/${IFRI}/validations`, {
    periodeId: p.id, lignes, idSaisie: `SCN-VAL-${p.id.slice(-24)}`,
  }), [200, 201]);
  validations += Array.isArray(v.enregistres) && !v.deja ? v.enregistres.length : 0;
}
// Les promotions passées ont suivi l'UE optionnelle du S5 hors contrat : acquise par décision de jury
// sur justification, pour qu'aucune n'arrive au diplôme avec 5 crédits fantômes.
for (const e of etudiants.filter((x) => x.entree <= ANNEE_COURANTE - 3)) {
  const p5 = periodeS5(e.entree + 2)!;
  const r = await direction.appel("POST", `/etablissements/${IFRI}/validations/hors-note`, {
    apprenantId: e.id, ueId: ues.get("INF3105")!.id, periodeId: p5.id, voie: "decision_jury",
    justification: "UE optionnelle suivie et évaluée avant l'ouverture du contrat en ligne (PV du S5)",
  });
  if (e.niveau >= 10) exiger(`UE optionnelle ${e.id}`, r, [201, 409]);
}
console.log(`${notes} note(s) d'UE saisie(s) ; ${validations} acquisition(s) enregistrée(s) par la règle en vigueur.`);

/* ------------------------------------------------------------------ 6. Jury et délibération de la promotion sortante */

const sortants = etudiants.filter((e) => e.entree === ANNEE_COURANTE - 3).map((e) => e.id);
const s6 = periodes.find((p) => p.an === ANNEE_COURANTE - 1 && p.semestre === 6)!;
const composition = {
  autorite: "jury_capitalisation", office: "etablissement", diplome: "LICENCE", periodeId: s6.id, filiereId: FILIERE, sessionExamenId: null,
  president: "Pr Eugène EZIN", membres: ["Dr Sèna HOUNKPATIN", "Dr Ratheil HOUNDJI", "Dr Arnaud AHOUANDJINOU", "M. Gaston ZINSOU"], quorum: 3,
  pvReference: `PV-IFRI-LIC-${ANNEE_COURANTE}-01`,
};
const jurys = exiger("Jurys de l'établissement", await direction.appel("GET", `/etablissements/${IFRI}/jurys`)) as unknown as { id: string; filiereId: string; periodeId: string; statut: string }[];
let jury = jurys.find((j) => j.filiereId === FILIERE && j.periodeId === s6.id);
if (!jury) {
  const j = exiger("Constitution du jury de licence", await direction.appel("POST", `/etablissements/${IFRI}/jurys`, { ...composition, juryId: null, statut: "constitue" }));
  jury = { id: String(j.juryId), filiereId: FILIERE, periodeId: s6.id, statut: "constitue" };
}
for (const statut of ["reuni", "delibere"] as const) {
  const ordre = ["constitue", "reuni", "delibere", "publie"];
  if (ordre.indexOf(jury.statut) >= ordre.indexOf(statut)) continue;
  exiger(`Jury → ${statut}`, await direction.appel("POST", `/etablissements/${IFRI}/jurys`, { ...composition, juryId: jury.id, statut }));
  jury.statut = statut;
}
// Le jury proclame admis ; le serveur recompte les crédits : qui n'a pas ses 180 n'est pas enregistré,
// et le jury statue alors l'ajournement en nommant les UE manquantes.
const admis = exiger("Délibération (admission)", await direction.appel("POST", `/etablissements/${IFRI}/deliberations`, {
  juryId: jury.id, idSaisie: `SCN-DELIB-A-${ANNEE_COURANTE}`, decisions: sortants.map((a) => ({ apprenantId: a, decision: "admis", ueManquantes: [] })),
}), [200, 201]);
const rendu = (admis.rendu ?? []) as { apprenantId: string; decision: string }[];
const nonEnregistres = rendu.filter((x) => x.decision === "non_enregistree").map((x) => x.apprenantId);
if (nonEnregistres.length) {
  const preparables = exiger("Acquis des ajournés", await direction.appel("GET", `/etablissements/${IFRI}/scolarite/credits-ects`), [200]);
  void preparables;
  const manquantes = (a: string) => [...ues.values()].filter((u) => u.type === "obligatoire" && note(a, u.code, etudiants.find((e) => e.id === a)!.niveau) < 10).map((u) => u.code).slice(0, 12);
  exiger("Délibération (ajournements)", await direction.appel("POST", `/etablissements/${IFRI}/deliberations`, {
    juryId: jury.id, idSaisie: `SCN-DELIB-J-${ANNEE_COURANTE}`, decisions: nonEnregistres.map((a) => ({ apprenantId: a, decision: "ajourne", ueManquantes: manquantes(a) })),
  }), [200, 201]);
}
const certifies = rendu.filter((x) => x.decision === "admis").length;
console.log(`Jury ${jury.id} : ${certifies} licence(s) délivrée(s) et scellée(s), ${nonEnregistres.length} ajournement(s) motivé(s).`);

/* ------------------------------------------------------------------ 7. Bureau du supérieur : échéances et allocations */

const attribution = exiger("Échéance d'attribution", await bureau.appel("POST", "/enseignement-superieur/echeances", {
  anneeUniversitaire: annee(ANNEE_COURANTE), typeDecision: "attribution", dateLimite: `${ANNEE_COURANTE}-11-20`,
  actesExiges: ["attestation_de_scolarite"], autorite: "dbau", intitule: "Dépôt des dossiers d'allocation (première attribution)",
}));
exiger("Échéance de renouvellement", await bureau.appel("POST", "/enseignement-superieur/echeances", {
  anneeUniversitaire: annee(ANNEE_COURANTE), typeDecision: "renouvellement", dateLimite: `${ANNEE_COURANTE}-12-15`,
  actesExiges: ["attestation_de_scolarite", "releve_de_notes"], autorite: "dbau", intitule: "Renouvellement des allocations (relevé de l'année précédente)",
}));
const encours = etudiants.filter((e) => e.entree >= ANNEE_COURANTE - 2);
let allocations = 0;
for (const [k, e] of encours.entries()) {
  if (k % 3 === 2) continue; // tous les étudiants ne sont pas allocataires
  const statutCompte = k % 5 === 0 ? "secours" : k % 3 === 0 ? "boursier_integral" : "demi_boursier";
  exiger(`Allocation ${e.id}`, await bureau.appel("POST", "/enseignement-superieur/allocations", {
    apprenantId: e.id, anneeUniversitaire: annee(ANNEE_COURANTE), typeDecision: statutCompte === "secours" ? "secours" : e.entree === ANNEE_COURANTE ? "attribution" : "renouvellement",
    statutCompte, autorite: "dbau", referenceActe: `Arrêté DBAU ${ANNEE_COURANTE}-${String(100 + k)}`,
    echeanceId: e.entree === ANNEE_COURANTE ? attribution.echeanceId : null, motif: null, decideLe: `${ANNEE_COURANTE}-09-25`,
  }), [200, 201]);
  allocations++;
}
console.log(`Calendrier de dépôt déclaré ; ${allocations} décision(s) d'allocation.`);

/* ------------------------------------------------------------------ 8. Guichet : actes de l'étudiant·e, du dépôt à la remise */

const actes = exiger("Mes actes", await etudiant.appel("GET", "/moi/actes")) as unknown as { id: string; typeActe: string; statut: string }[] | { actes?: unknown };
const liste = (Array.isArray(actes) ? actes : ((actes as { actes?: unknown }).actes ?? [])) as { id: string; typeActe: string; statut: string }[];
const demander = async (typeActe: string, anneeUniversitaire: string) => {
  const deja = liste.find((a) => a.typeActe === typeActe && a.statut !== "refusee" && a.statut !== "retiree");
  if (deja) return deja.id;
  const r = exiger(`Demande ${typeActe}`, await etudiant.appel("POST", "/moi/actes/demande", {
    typeActe, anneeUniversitaire, periodeId: null, motifDemande: null, idSaisie: `SCN-ACTE-${typeActe.replace(/_/g, "-").slice(0, 24)}-${anneeUniversitaire}`,
  }), [200, 201]);
  return String(r.demandeId ?? (r as { acte?: { id: string } }).acte?.id);
};
const attestation = await demander("attestation_de_scolarite", annee(ANNEE_COURANTE));
const releve = await demander("releve_de_notes", annee(ANNEE_COURANTE - 1));
for (const [demande, suite] of [[attestation, ["en_instruction", "disponible", "remise"]], [releve, ["en_instruction", "disponible"]]] as const) {
  for (const statut of suite) {
    const r = await direction.appel("POST", `/etablissements/${IFRI}/actes/${demande}/decision`, {
      statut, date: aujourdhui, ...(statut === "remise" ? { modeRetrait: "titulaire", piecePresentee: "carte_nationale_identite" } : {}),
    });
    exiger(`Acte ${demande.slice(0, 13)} → ${statut}`, r, [200, 409]); // 409 : déjà passé à cet état (rejeu)
  }
}
console.log("Guichet : attestation de scolarité remise, relevé de notes disponible (scellés, vérifiables).");

/* ------------------------------------------------------------------ 9. Stage de L3 */

const stages = exiger("Mes stages", await etudiant.appel("GET", "/moi/stages")) as unknown as unknown[];
if (!stages.length) {
  const st = exiger("Déclaration du stage", await etudiant.appel("POST", "/moi/stages", {
    entreprise: "Agence des Systèmes d'Information et du Numérique (démonstration)", tuteurPro: "M. Olivier DJOSSOU", du: `${ANNEE_COURANTE + 1}-05-03`, au: `${ANNEE_COURANTE + 1}-07-02`,
  }));
  exiger("Encadrement académique", await enseignante.appel("POST", `/moi/stages/${st.id}/encadrer`, {}), [200, 201]);
  exiger("Convention en cours", await etudiant.appel("POST", `/moi/stages/${st.id}/statut`, { statut: "convention_en_cours" }), [200, 201]);
}
console.log("Stage de L3 déclaré et encadré.");

console.log(`\nScénario du supérieur joué par l'API : ${etapes} appels vérifiés.`);
