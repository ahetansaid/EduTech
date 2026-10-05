import { connecter, schema } from "@beile/db";
import { and, desc, eq } from "drizzle-orm";
import { COMPTES, codeFrais, Session, TOTP } from "./client-recette";

/**
 * Recette de l'API avec de VRAIS comptes (identifiant + mot de passe, cookie de session, jeton CSRF).
 * Chaque cas vérifie un statut attendu, y compris les refus, et des scénarios multi-utilisateurs.
 *
 * Usage : API démarrée, puis `npm run recette -w @beile/api`.
 *   --ecritures : exécute aussi les cas qui écrivent au registre (ajout seul, donc définitifs).
 *                 À réserver à une branche de base éphémère (CI) — jamais sur la base de production.
 */
const ECRITURES = process.argv.includes("--ecritures");
const AUJOURDHUI = new Date().toISOString().slice(0, 10);
const PILOTE = "ETB-PAR-PILOTE-CEG";
let echecs = 0, cas = 0;

function verifier(libelle: string, obtenu: number | boolean, attendu: number | boolean | number[], detail = "") {
  cas++;
  const ok = Array.isArray(attendu) ? attendu.includes(obtenu as number) : obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? "✔" : "✘"} ${libelle} — ${obtenu}${ok ? "" : ` (attendu ${attendu})`}${detail ? ` · ${detail}` : ""}`);
}
const titre = (t: string) => console.log(`\n— ${t}`);

/** NPI d'un adulte du registre sans compte (tout compte est rattaché à une personne réelle). Recette avec écritures seulement. */
async function npiLibre(): Promise<string> {
  const { client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const [p] = (await client`select p.npi from registre_simule.personnes p where p.date_naissance < '1995-01-01'
    and not exists (select 1 from core.profils x where x.npi = p.npi) order by random() limit 1`) as unknown as { npi: string }[];
  await client.end();
  return p?.npi ?? "";
}
const liste = (j: unknown) => (Array.isArray(j) ? j : []) as Record<string, unknown>[];

titre("Authentification");
const anonyme = new Session();
verifier("TÉMOIN : santé publique sans session", (await anonyme.appel("GET", "/sante")).statut, 200);
verifier("Session sans cookie", (await anonyme.appel("GET", "/auth/session")).statut, 401);
verifier("Indicateur sans session", (await anonyme.appel("POST", "/indicateurs", {})).statut, 401);
verifier("Mauvais mot de passe", (await new Session().connexion("idrissou.sanni", "Faux-Mot-De-Passe-1")).statut, 401);
verifier("Compte inexistant (même réponse, pas d'énumération)", (await new Session().connexion("personne.inconnue", "Quelconque-123")).statut, 401);
verifier("Champ inattendu à la connexion", (await anonyme.appel("POST", "/auth/connexion", { identifiant: "x.y", motDePasse: "z", role: "admin" })).statut, 422);
verifier("Connexion depuis une origine étrangère", (await new Session().appel("POST", "/auth/connexion", { identifiant: "idrissou.sanni", motDePasse: "x" }, { origin: "https://pirate.example" })).statut, 403);

const [central, departement, inspecteur, directrice, enseignant, parent, apprenante, dpo, admin] = await Promise.all(
  ["felicite.akakpo", "bertrand.chabi", "nestor.orou", "hortense.guera", "idrissou.sanni", "chantal.dossou", "aicha.zannou", "laure.zannou", "admin.beile"].map(async (id) => {
    const s = new Session();
    const r = await s.connexion(id);
    verifier(`Connexion ${id}`, r.statut, 200);
    return s;
  }),
);
verifier("Cookie de session HttpOnly posé", enseignant!.aSession, true);
// Administration des comptes : élévation juste à temps de l'autorité (second facteur), valable 15 minutes.
verifier("Administrateur : élévation par second facteur", (await admin!.elever()).statut, 200);
const absence = { classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, apprenantIds: ["APP-000001"] };
verifier("Écriture sans jeton CSRF", (await enseignant!.appel("POST", "/evenements/absences", absence, { "x-csrf-token": "" })).statut, 403);
verifier("Écriture depuis une origine étrangère", (await enseignant!.appel("POST", "/evenements/absences", absence, { origin: "https://pirate.example" })).statut, 403);

titre("Pilotage sous périmètre (couche sémantique)");
const ind = await central!.appel("POST", "/indicateurs", { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15, ageMin: 11, ageMax: 13 }, ventilation: ["sexe"] });
verifier("Indicateur national", ind.statut, 200, `valeur ${ind.json.valeur} %`);
verifier("Champ inconnu dans la requête", (await central!.appel("POST", "/indicateurs", { indicateur: "taux_abandon", filtres: { sql: "DROP" }, ventilation: [] })).statut, 422);
verifier("Indicateur demandé par un enseignant", (await enseignant!.appel("POST", "/indicateurs", { indicateur: "taux_abandon", filtres: {}, ventilation: [] })).statut, 403);
const hors = await departement!.appel("POST", "/ask", { question: "Quel est le taux d'abandon dans les communes rurales de l'Atacora ?" });
verifier("Ask hors périmètre (Borgou → Atacora)", hors.statut, 200, `statut ${hors.json.statut}`);
const synth = await departement!.appel("GET", "/pilotage/synthese");
verifier("Synthèse départementale", synth.statut, 200, String((synth.json.perimetre as { libelle?: string })?.libelle));
verifier("Carte thématique", (await central!.appel("GET", "/pilotage/carte?couche=abandon")).statut, 200);
verifier("Couche de carte inconnue", (await central!.appel("GET", "/pilotage/carte?couche=salaires")).statut, [400, 422]);
verifier("Fiche d'une commune hors périmètre (Borgou → Cotonou)", (await departement!.appel("GET", "/pilotage/communes/cotonou")).statut, 403);
verifier("Territoire de l'inspection", (await inspecteur!.appel("GET", "/pilotage/territoire")).statut, 200);
verifier("Pilotage demandé par un parent", (await parent!.appel("GET", "/pilotage/synthese")).statut, 403);

titre("ABAC individuel : l'enseignant-parent");
verifier("Enseignant → élève de sa classe (évaluation)", (await enseignant!.appel("GET", "/apprenants/APP-000001?finalite=evaluation")).statut, 200);
const zoulfath = "APP-000003";
verifier("Enseignant → sa fille, finalité évaluation", (await enseignant!.appel("GET", `/apprenants/${zoulfath}?finalite=evaluation`)).statut, 403);
verifier("Enseignant → sa fille, finalité suivi familial", (await enseignant!.appel("GET", `/apprenants/${zoulfath}?finalite=suivi_familial`)).statut, 200);

titre("Établissement");
const tableau = await directrice!.appel("GET", `/etablissements/${PILOTE}/tableau`);
verifier("Directrice → tableau de bord", tableau.statut, 200, `${(tableau.json.chiffres as { apprenants: number })?.apprenants} apprenants`);
verifier("Directrice → liste des élèves", (await directrice!.appel("GET", `/etablissements/${PILOTE}/eleves`)).statut, 200);
verifier("Directrice → autre établissement", (await directrice!.appel("GET", "/etablissements/ETB-COT-PILOTE-CEG/tableau")).statut, 403);
verifier("Inspecteur de la circonscription → tableau (contrôle)", (await inspecteur!.appel("GET", `/etablissements/${PILOTE}/tableau`)).statut, 200);
// Un établissement ne délibère pas un examen national : la route n'existe plus, même pour son chef.
verifier("Directrice → délibérer un examen national (route retirée)", (await directrice!.appel("POST", `/etablissements/${PILOTE}/examens/deliberation`, {})).statut, 404);
const examensEtab = await directrice!.appel("GET", `/etablissements/${PILOTE}/examens`);
verifier("Directrice → examens nationaux (lecture seule)", examensEtab.statut, 200);
verifier("Examens de l'établissement : sessions et diplômes", Array.isArray((examensEtab.json as { sessions?: unknown }).sessions) && Array.isArray((examensEtab.json as { diplomes?: unknown }).diplomes), true);
verifier("Enseignant → examens de l'établissement", (await enseignant!.appel("GET", `/etablissements/${PILOTE}/examens`)).statut, 403);
verifier("Transfert par un enseignant", (await enseignant!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: "CLS-COT-5eA-S" })).statut, 403);
verifier("Directrice → registre national", (await directrice!.appel("GET", "/registre/personnes?nom=WOROU&prenoms=Sidonie")).statut, 200);
verifier("Enseignant → registre national", (await enseignant!.appel("GET", "/registre/personnes?nom=WOROU")).statut, 403);
verifier("Inscription dans un autre établissement", (await directrice!.appel("POST", "/inscriptions", { classeId: "CLS-COT-5eA-S", sansActe: { nom: "Test", prenoms: "Refus", sexe: "M", dateNaissance: "2013-05-01", responsable: "x" } })).statut, 403);

titre("Enseignant");
const classes = await enseignant!.appel("GET", "/moi/classes");
verifier("Mes classes", classes.statut, 200, `${liste((classes.json as { classes?: unknown }).classes).length} classe(s)`);
verifier("Carnet de la 5e A (relation pédagogique)", (await enseignant!.appel("GET", "/classes/CLS-PAR-5eA-S")).statut, 200);
verifier("Carnet de la 3e A (aucune relation)", (await enseignant!.appel("GET", "/classes/CLS-PAR-3eA-S")).statut, 403);
verifier("Carrière", (await enseignant!.appel("GET", "/moi/carriere")).statut, 200);
verifier("Absence en 3e A (pas sa classe)", (await enseignant!.appel("POST", "/evenements/absences", { ...absence, classeId: "CLS-PAR-3eA-S" })).statut, 403);
verifier("Absence d'un élève hors de la classe", (await enseignant!.appel("POST", "/evenements/absences", { ...absence, apprenantIds: [zoulfath] })).statut, 422);
verifier("Notes de français (pas sa matière)", (await enseignant!.appel("POST", "/evenements/evaluations", { classeId: "CLS-PAR-5eA-S", matiere: "Français", trimestre: 2, notes: [{ apprenantId: "APP-000001", note: 12 }] })).statut, 403);
verifier("Note hors barème (21/20)", (await enseignant!.appel("POST", "/evenements/evaluations", { classeId: "CLS-PAR-5eA-S", matiere: "Mathématiques", trimestre: 2, notes: [{ apprenantId: "APP-000001", note: 21 }] })).statut, 422);
verifier("Formation inconnue au catalogue", (await enseignant!.appel("POST", "/moi/formations", { code: "INCONNUE" })).statut, 422);

titre("Familles et apprenants");
const enfants = await parent!.appel("GET", "/famille/enfants");
verifier("Parent → ses enfants (filiation vérifiée)", enfants.statut, 200, `${liste(enfants.json).length} enfant(s)`);
verifier("Directrice → espace famille", (await directrice!.appel("GET", "/famille/enfants")).statut, 403);
verifier("Apprenante → son passeport", (await apprenante!.appel("GET", "/moi/passeport")).statut, 200);
verifier("Directrice → passeport", (await directrice!.appel("GET", "/moi/passeport")).statut, 403);
verifier("Parent → notifications", (await parent!.appel("GET", "/moi/notifications")).statut, 200);
verifier("Parent → carrière enseignante", (await parent!.appel("GET", "/moi/carriere")).statut, 403);

titre("Gouvernance et exploitation");
verifier("Cabinet → journal d'audit", (await central!.appel("GET", "/audit")).statut, 403);
const journal = await dpo!.appel("GET", "/audit?limite=40");
verifier("DPO → journal d'audit", journal.statut, 200, `${liste(journal.json).filter((l) => !l.autorise).length} refus parmi les 40 dernières entrées`);
verifier("Administrateur → comptes", (await admin!.appel("GET", "/admin/comptes")).statut, 200);
verifier("DPO → administration des comptes", (await dpo!.appel("GET", "/admin/comptes")).statut, 403);
verifier("Administrateur → état de service", (await admin!.appel("GET", "/plateforme/etat")).statut, 200);
verifier("Direction départementale → état de service", (await departement!.appel("GET", "/plateforme/etat")).statut, 403);
verifier("Qualité des remontées (Borgou)", (await departement!.appel("GET", "/plateforme/qualite")).statut, 200);
verifier("Relance hors périmètre", (await departement!.appel("POST", "/plateforme/relances", { etablissementIds: ["ETB-COT-PILOTE-CEG"] })).statut, 403);
verifier("Vérification publique d'un diplôme", (await anonyme.appel("GET", "/certificats/CERT-CEP-2024-000001/verification")).statut, 200);
verifier("Identifiant de diplôme mal formé", (await anonyme.appel("GET", "/certificats/abc'--/verification")).statut, 400);
// Deux régimes dans le service public : l'identifiant seul atteste l'existence du diplôme, jamais son
// titulaire. La fin d'un identifiant reprend le numéro d'apprenant — livrer le nom sur l'identifiant
// seul permettrait de parcourir une promotion entière sans jamais scanner un document.
const sansSceau = await anonyme.appel("GET", "/certificats/CERT-CEP-2024-000001/verification");
verifier("Identifiant seul → « sans_empreinte », et aucun nom rendu", (sansSceau.json as { statut?: string; titulaire?: string }).statut === "sans_empreinte" && !(sansSceau.json as { titulaire?: string }).titulaire, true);
const prefixe = await anonyme.appel("GET", "/certificats/CERT-CEP-2024-000001/verification?e=ab12");
verifier("Un préfixe d'empreinte (4 caractères) ne débloque aucune identité", (prefixe.json as { statut?: string }).statut === "sans_empreinte", true);
const foreign = await anonyme.appel("GET", "/certificats/CERT-CEP-2024-000001/verification?e=0000000000000000000000000000ffff");
verifier("Une empreinte présentée qui ne correspond pas → « altéré »", (foreign.json as { statut?: string }).statut === "altere", true);

titre("Services publics (sans compte)");
const annuaire = await anonyme.appel("GET", "/public/etablissements?niveau=secondaire&departement=borgou");
verifier("Annuaire : recherche par niveau et département", annuaire.statut, 200, `${annuaire.json.total} établissement(s)`);
const proches = await anonyme.appel("GET", "/public/etablissements?lat=9.35&lng=2.61");
const distances = liste(proches.json.etablissements).map((e) => Number(e.distanceKm));
verifier("Annuaire : autour de moi, du plus proche au plus éloigné", distances.length > 1 && distances.every((d, i) => i === 0 || d >= distances[i - 1]!), true);
// L'annuaire public lit le référentiel réel (identifiants REF-…), jamais le jeu de démonstration du pilotage.
const premier = liste(proches.json.etablissements)[0]?.id as string | undefined;
verifier("Annuaire : établissements réels (référentiel sourcé)", !!premier && premier.startsWith("REF-"), true, premier ?? "aucun");
const fiche = await anonyme.appel("GET", `/public/etablissements/${premier}`);
verifier("Annuaire : fiche d'un établissement, avec sa source", fiche.statut === 200 && typeof fiche.json.source === "string" && !!fiche.json.preuve, true);
verifier("Annuaire : établissement inconnu", (await anonyme.appel("GET", "/public/etablissements/REF-INCONNU")).statut, 404);
verifier("Annuaire : un établissement de démonstration n'y figure pas", [404, 422].includes((await anonyme.appel("GET", `/public/etablissements/${PILOTE}`)).statut), true);
verifier("Annuaire : niveau invalide", (await anonyme.appel("GET", "/public/etablissements?niveau=nimporte")).statut, 422);
verifier("Annuaire : coordonnées hors du Bénin", (await anonyme.appel("GET", "/public/etablissements?lat=48.85&lng=2.35")).statut, 422);
const chiffres = await anonyme.appel("GET", "/public/chiffres");
verifier("L'éducation en chiffres : indicateurs agrégés", chiffres.statut === 200 && liste(chiffres.json.indicateurs).length === 4, true);

const cal = await anonyme.appel("GET", "/public/calendrier");
verifier("Calendrier public : année en cours et échéances", cal.statut === 200 && liste(cal.json.evenements).length > 0, true, String(cal.json.annee ?? ""));
verifier("Calendrier : enseignant → ajout d'une échéance", (await enseignant!.appel("POST", "/admin/calendrier", { annee: "2026-2027", titre: "Essai", categorie: "autre", debut: "2026-10-01", fin: "2026-10-01", statut: "provisoire" })).statut, 403);
verifier("Calendrier : fin avant le début", (await admin!.appel("POST", "/admin/calendrier", { annee: "2026-2027", titre: "Essai incohérent", categorie: "conges", debut: "2026-12-20", fin: "2026-12-10", statut: "provisoire" })).statut, 422);
verifier("Calendrier : date hors de l'année scolaire", (await admin!.appel("POST", "/admin/calendrier", { annee: "2026-2027", titre: "Essai hors année", categorie: "conges", debut: "2029-01-10", fin: "2029-01-12", statut: "provisoire" })).statut, 422);

titre("Examens nationaux — e-résultat");
// Recherche publique (sans compte) : le verdict d'une session publiée, et rien avant publication.
const resAdmis = await anonyme.appel("GET", "/public/resultats?examen=CEP&session=Juin%202024&table=2024000001");
verifier("Public : session publiée → verdict", resAdmis.statut, 200, String(resAdmis.json.statut ?? ""));
verifier("Public : numéro de table d'un lauréat → « admis »", (resAdmis.json as { statut?: string }).statut === "admis", true);
verifier("Public : sans date de naissance, ni nom ni moyenne", (resAdmis.json as { identite?: unknown }).identite === null && !("titulaire" in resAdmis.json), true);
verifier("Public : date de naissance dans l'adresse (GET) refusée", (await anonyme.appel("GET", "/public/resultats?examen=CEP&session=Juin%202024&table=2024000001&naissance=1900-01-01")).statut, 422);
const resDateFausse = await anonyme.appel("POST", "/public/resultats", { examen: "CEP", session: "Juin 2024", table: "2024000001", naissance: "1900-01-01" });
// Plafond d'essais de date : un numéro « déguisé » (espaces) désigne le même candidat et n'ouvre pas de nouveaux essais.
const variantes: { statut: number }[] = [];
for (let i = 0; i < 11; i++) variantes.push(await anonyme.appel("POST", "/public/resultats", { examen: "CEP", session: "Juin 2024", table: `${" ".repeat(i)}2024000002`, naissance: `1900-01-${String(i + 1).padStart(2, "0")}` }));
verifier("Public : essais de date plafonnés par candidat, même déguisé par des espaces", variantes.some((v) => v.statut === 429), true, variantes.map((v) => v.statut).join(","));
verifier("Public : date de naissance fausse → aucune identité, signalée", (resDateFausse.json as { identite?: unknown; dateNonConcordante?: boolean }).identite === null && (resDateFausse.json as { dateNonConcordante?: boolean }).dateNonConcordante === true, true);
const sessionsPub = await anonyme.appel("GET", "/public/resultats/sessions");
verifier("Public : sessions publiées proposées au choix", liste(sessionsPub.json).some((x) => x.examen === "CEP" && x.session === "Juin 2024"), true);
verifier("Public : chaque session nomme son autorité (pas d'« ONEC », pas d'« Office du Bac »)", liste(sessionsPub.json).every((x) => typeof x.autorite === "string" && !/ONEC|Office national des examens|Office du Bac/i.test(String(x.autorite))), true);
verifier("Public : session inconnue → « introuvable » (jamais un 500)", (await anonyme.appel("GET", "/public/resultats?examen=CEP&session=Janvier%201900&table=1900000001")).statut, 200);
verifier("Public : table absente d'une session publiée → « introuvable »", (await anonyme.appel("GET", "/public/resultats?examen=CEP&session=Juin%202024&table=2024099999")).statut, 200);
verifier("Paramètre d'examen invalide → 422", (await anonyme.appel("GET", "/public/resultats?examen=BREVET&session=Juin%202024&table=1")).statut, 422);
verifier("Requête incomplète (sans numéro de table) → 422", (await anonyme.appel("GET", "/public/resultats?examen=CEP&session=Juin%202024")).statut, 422);
// Bureau des examens : réservé à l'administration centrale ; toute écriture hors session est refusée.
verifier("Administration centrale → sessions d'examen", (await central!.appel("GET", "/examens/sessions")).statut, 200);
verifier("Sans session → bureau des examens", (await anonyme.appel("GET", "/examens/sessions")).statut, 401);
verifier("Enseignant → ouverture d'une session (écriture interdite)", (await enseignant!.appel("POST", "/examens/sessions", { examen: "CEP", session: "Test Recette" })).statut, 403);
// Le sigle reste dans l'énumération (relire une écriture ancienne) mais aucune autorité béninoise ne le
// publie : refuser à l'ouverture est la seule manière honnête de ne pas créer un examen national fictif.
verifier("Bureau des examens : ouvrir une session « BT » → refus (aucune autorité ne délibère ce sigle)", (await central!.appel("POST", "/examens/sessions", { examen: "BT", session: "Test Recette BT" })).statut, 422);
verifier("Bureau des examens : ouvrir une session « BEP » → refus", (await central!.appel("POST", "/examens/sessions", { examen: "BEP", session: "Test Recette BEP" })).statut, 422);
verifier("Inspecteur → constitution du candidaturé (hors bureau)", (await inspecteur!.appel("POST", "/examens/sessions/SES-INEXISTANT/candidatures", { etablissementId: PILOTE, centreId: "CEN-INEXISTANT" })).statut, 403);

titre("Cycle annuel, classes et autorité de certification (refus : aucune écriture)");
// Révocation d'un diplôme : autorité de certification (administration centrale) seule ; refus journalisé sinon.
verifier("Sans session → révocation d'un diplôme", (await anonyme.appel("POST", "/certificats/CERT-CEP-2024-000001/revocation", { motif: "Tentative anonyme" })).statut, 401);
verifier("Enseignant → révocation d'un diplôme", (await enseignant!.appel("POST", "/certificats/CERT-CEP-2024-000001/revocation", { motif: "Tentative enseignant" })).statut, 403);
// Édition de classe et conseil de passage : chef de l'établissement concerné uniquement.
verifier("Enseignant → édition d'une classe d'autrui", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S`, { capacite: 40, enseignantPrincipalId: null })).statut, 403);
verifier("Enseignant → conseil de passage d'une classe d'autrui", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, { anneeScolaire: "2027-2028", decisions: [{ apprenantId: "APP-000001", decision: "admis" }] })).statut, 403);
// Affectation d'un enseignant : initiative réservée à la direction départementale ; refus avant toute écriture.
verifier("Sans session → demande d'affectation", (await anonyme.appel("POST", "/enseignants/ENS-00001/affectation", { versEtablissementId: PILOTE })).statut, 401);
verifier("Enseignant → demande d'affectation (rôle insuffisant)", (await enseignant!.appel("POST", "/enseignants/ENS-00001/affectation", { versEtablissementId: PILOTE })).statut, 403);

titre("Administration des utilisateurs et assistance (refus : aucune écriture)");
const comptes = liste((await admin!.appel("GET", "/admin/comptes")).json);
const moiAdmin = comptes.find((x) => x.identifiant === "admin.beile")?.id as string | undefined;
verifier("Enseignant → création d'un utilisateur", (await enseignant!.appel("POST", "/admin/utilisateurs", { nomAffiche: "Test Refus", fonction: "Essai", habilitations: [{ role: "chercheur", perimetre: { niveau: "national" } }] })).statut, 403);
verifier("Habilitation incohérente (chef d'établissement sur un département)", (await admin!.appel("POST", "/admin/utilisateurs", { nomAffiche: "Test Incoherent", fonction: "Essai", habilitations: [{ role: "chef_etablissement", perimetre: { niveau: "departement", departementId: "borgou" } }] })).statut, 422);
verifier("Établissement inexistant", (await admin!.appel("POST", "/admin/utilisateurs", { nomAffiche: "Test Inexistant", fonction: "Essai", habilitations: [{ role: "chef_etablissement", perimetre: { niveau: "etablissement", etablissementId: "ETB-INEXISTANT-01" } }] })).statut, 422);
verifier("Enseignant sans NPI", (await admin!.appel("POST", "/admin/utilisateurs", { nomAffiche: "Test Sans Npi", fonction: "Essai", habilitations: [{ role: "enseignant", perimetre: { niveau: "etablissement", etablissementId: PILOTE } }] })).statut, 422);
verifier("Administrateur : retrait de son propre rôle", moiAdmin ? (await admin!.appel("POST", `/admin/comptes/${moiAdmin}/profil`, { habilitations: [{ role: "dpo", perimetre: { niveau: "national" } }] })).statut : 0, 422);
verifier("Parent → file des demandes d'assistance", (await parent!.appel("GET", "/admin/tickets")).statut, 403);
verifier("Sans session → créer une demande", (await anonyme.appel("POST", "/assistance/tickets", { categorie: "bug", sujet: "Essai", description: "Essai sans session" })).statut, 401);
verifier("Demande d'assistance inconnue", (await parent!.appel("GET", "/assistance/tickets/AST-ABCDEFGH")).statut, 404);

titre("Concurrence : 40 lectures simultanées de profils différents");
const debut = Date.now();
const lots = await Promise.all(Array.from({ length: 40 }, (_, i) => [
  () => directrice!.appel("GET", `/etablissements/${PILOTE}/eleves`),
  () => enseignant!.appel("GET", "/moi/classes"),
  () => parent!.appel("GET", "/famille/enfants"),
  () => departement!.appel("GET", "/pilotage/synthese"),
][i % 4]!()));
verifier("40 requêtes concurrentes, toutes servies", lots.every((r) => r.statut === 200), true, `${Date.now() - debut} ms au total`);

if (ECRITURES) {
  titre("Scénario multi-utilisateurs (écritures au registre)");
  const avant = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number }).nonLues ?? 0);
  const saisie = await enseignant!.appel("POST", "/evenements/absences", absence);
  verifier("Enseignant : appel en 5e A", saisie.statut, 201);
  const vue = await directrice!.appel("GET", `/etablissements/${PILOTE}/tableau`);
  const ids = liste(vue.json.absencesDuJour).map((a) => a.id);
  verifier("Directrice : l'absence apparaît immédiatement au tableau de bord", ids.includes((saisie.json.enregistres as string[] | undefined)?.[0]), true);
  const apres = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number }).nonLues ?? 0);
  verifier("Parent : notification reçue", apres > avant, true, `${avant} → ${apres} non lue(s)`);
  verifier("Parent : notifications marquées lues", (await parent!.appel("POST", "/moi/notifications/lues", {})).statut, 200);

  const notes = await enseignant!.appel("POST", "/evenements/evaluations", { classeId: "CLS-PAR-5eA-S", matiere: "Mathématiques", trimestre: 2, notes: [{ apprenantId: "APP-000001", note: 14.5 }] });
  verifier("Enseignant : notes de mathématiques", notes.statut, 201);
  const idNote = (notes.json.enregistres as string[] | undefined)?.[0] ?? "EVT-inexistant";
  verifier("Directrice : correction de la note d'un collègue", (await directrice!.appel("POST", "/evenements/corrections", { evenementCorrigeId: idNote, nouvelleNote: 20, motif: "Tentative non autorisée" })).statut, 403);
  verifier("Enseignant : correction motivée", (await enseignant!.appel("POST", "/evenements/corrections", { evenementCorrigeId: idNote, nouvelleNote: 15, motif: "Erreur de report" })).statut, 201);
  const carnet = await enseignant!.appel("GET", "/classes/CLS-PAR-5eA-S");
  const note = liste(carnet.json.eleves).find((e) => e.id === "APP-000001")?.notes as { id: string; note: number; corrigee: boolean }[] | undefined;
  const corrigee = note?.find((n) => n.id === idNote);
  verifier("Carnet : la note effective est la note corrigée", corrigee?.note === 15 && corrigee.corrigee, true);

  const recherche = await directrice!.appel("GET", "/registre/personnes?nom=WOROU&prenoms=Sidonie");
  const sidonie = liste(recherche.json).find((p) => p.prenoms === "Sidonie") as { npi?: string } | undefined;
  verifier("Inscription par NPI (201, ou 409 si déjà inscrite)", (await directrice!.appel("POST", "/inscriptions", { classeId: "CLS-PAR-6eA-S", npi: sidonie?.npi ?? "0000000000" })).statut, [201, 409]);
  verifier("Proposition d'accompagnement (circuit de validation)", (await directrice!.appel("POST", `/etablissements/${PILOTE}/accompagnement`, { apprenantIds: ["APP-000001"], objet: "Soutien en mathématiques" })).statut, 201);
  verifier("Inscription à une formation (201, ou 409 si déjà inscrit)", (await enseignant!.appel("POST", "/moi/formations", { code: "EVAL-FORM-MATHS" })).statut, [201, 409]);

  titre("Administration : création d'un compte, première connexion, assistance");
  const suffixe = Math.random().toString(36).slice(2, 7).replace(/\d/g, "x");
  const cree = await admin!.appel("POST", "/admin/utilisateurs", { nomAffiche: `Recette Chercheur ${suffixe}`, fonction: "Chercheur associé · recette", habilitations: [{ role: "chercheur", perimetre: { niveau: "national" } }] });
  verifier("Administrateur : création d'un utilisateur", cree.statut, 201, String((cree.json.compte as { identifiant?: string } | undefined)?.identifiant ?? ""));
  const nouveau = new Session();
  const identifiantNouveau = (cree.json.compte as { identifiant?: string } | undefined)?.identifiant ?? "";
  verifier("Nouvel utilisateur : connexion avec le mot de passe temporaire", (await nouveau.connexion(identifiantNouveau, String(cree.json.motDePasseTemporaire ?? ""))).statut, 200);
  verifier("Nouvel utilisateur : changement de mot de passe exigé", ((await nouveau.appel("GET", "/auth/session")).json.compte as { doitChangerMotDePasse?: boolean } | undefined)?.doitChangerMotDePasse === true, true);
  verifier("Identifiant déjà attribué", (await admin!.appel("POST", "/admin/utilisateurs", { nomAffiche: "Doublon", fonction: "Essai", identifiant: identifiantNouveau, habilitations: [{ role: "chercheur", perimetre: { niveau: "national" } }] })).statut, 409);

  const ticket = await parent!.appel("POST", "/assistance/tickets", { categorie: "donnees", sujet: "Note manquante en SVT", description: "La note du dernier devoir de SVT n'apparaît pas pour Aïcha." });
  const idTicket = String(ticket.json.id ?? "");
  verifier("Parent : demande d'assistance créée", ticket.statut, 201, idTicket);
  verifier("Autre utilisateur : demande d'un tiers invisible", (await enseignant!.appel("GET", `/assistance/tickets/${idTicket}`)).statut, 404);
  const file = await admin!.appel("GET", "/admin/tickets?statut=actifs");
  verifier("Administrateur : la demande arrive dans la file", liste(file.json.tickets).some((t) => t.id === idTicket), true);
  verifier("Administrateur : réponse", (await admin!.appel("POST", `/assistance/tickets/${idTicket}/messages`, { contenu: "Merci, l'enseignant a été prévenu ; la note sera saisie aujourd'hui." })).statut, 201);
  const fil = await parent!.appel("GET", `/assistance/tickets/${idTicket}`);
  verifier("Parent : réponse reçue, demande passée « en cours »", liste(fil.json.messages).length === 1 && (fil.json.ticket as { statut?: string } | undefined)?.statut === "en_cours", true);
  verifier("Administrateur : demande résolue", (await admin!.appel("POST", `/admin/tickets/${idTicket}/statut`, { statut: "resolu" })).statut, 200);

  titre("Calendrier : publication par l'administration");
  const echeance = { annee: "2026-2027", titre: "Journée pédagogique (recette)", categorie: "autre", debut: "2026-11-12", fin: "2026-11-12", statut: "provisoire" };
  const ajout = await admin!.appel("POST", "/admin/calendrier", echeance);
  verifier("Administrateur : ajout d'une échéance", ajout.statut, 201);
  const idCal = String(ajout.json.id ?? "");
  verifier("Public : l'échéance apparaît", liste((await anonyme.appel("GET", "/public/calendrier?annee=2026-2027")).json.evenements).some((e) => e.id === idCal), true);
  verifier("Administrateur : passage en « officiel »", (await admin!.appel("POST", `/admin/calendrier/${idCal}`, { ...echeance, statut: "officiel" })).statut, 200);
  verifier("Public : statut officiel visible", liste((await anonyme.appel("GET", "/public/calendrier?annee=2026-2027")).json.evenements).find((e) => e.id === idCal)?.statut === "officiel", true);
  verifier("Administrateur : suppression", (await admin!.appel("POST", `/admin/calendrier/${idCal}/supprimer`)).statut, 200);

  titre("Examens nationaux : réception du PV, publication, diplômes (écritures)");
  {
    const libelle = `Recette ${Date.now()}`;
    const ses = await central!.appel("POST", "/examens/sessions", { examen: "CEP", session: libelle });
    verifier("Bureau : ouverture d'une session CEP", ses.statut, 201);
    const centres = liste((await central!.appel("GET", "/examens/centres")).json);
    const cand = await central!.appel("POST", `/examens/sessions/${ses.json.id}/candidatures`, { etablissementId: "ETB-PAR-PILOTE-EPP", centreId: centres[0]?.id });
    verifier("Bureau : candidaturé du CM2 de l'école pilote", cand.statut, 201, `${cand.json.ajoutes} candidat(s)`);
    const tables = liste((await central!.appel("GET", `/examens/sessions/${ses.json.id}/candidatures`)).json).map((x) => String(x.numeroTable));
    verifier("Bureau : PV avec une moyenne pour un absent → 422", (await central!.appel("POST", `/examens/sessions/${ses.json.id}/deliberation`, { pvReference: "PV-RECETTE", decisions: [{ numeroTable: tables[0], decision: "absent", moyenne: 12 }] })).statut, 422);
    const [premier, second, ...autres] = tables;
    const partiel = await central!.appel("POST", `/examens/sessions/${ses.json.id}/deliberation`, { pvReference: "PV-RECETTE-1", decisions: [{ numeroTable: premier, decision: "admis", moyenne: 14.5 }] });
    verifier("Bureau : réception d'un premier lot du PV", partiel.statut, 200, `${partiel.json.recus} verdict(s)`);
    if (autres.length || second) verifier("Publication refusée tant que tous ne sont pas statués", (await central!.appel("POST", `/examens/sessions/${ses.json.id}/publication`, {})).statut, 409);
    const reste = [...(second ? [{ numeroTable: second, decision: "absent", moyenne: null }] : []), ...autres.map((t) => ({ numeroTable: t, decision: "non_admis", moyenne: 8 }))];
    if (reste.length) verifier("Bureau : réception du reste du PV", (await central!.appel("POST", `/examens/sessions/${ses.json.id}/deliberation`, { pvReference: "PV-RECETTE-2", decisions: reste })).statut, 200);
    const pub = await central!.appel("POST", `/examens/sessions/${ses.json.id}/publication`, {});
    verifier("Publication : diplômes délivrés au nom de la DEC du MEMP", pub.statut === 200 && pub.json.diplomes === 1 && /maternel et primaire/.test(String(pub.json.autorite)), true, `${pub.json.diplomes} diplôme(s)`);
    const verif = await anonyme.appel("GET", `/public/resultats?examen=CEP&session=${encodeURIComponent(libelle)}&table=${premier}`);
    verifier("Public : le lauréat voit « admis » après publication", (verif.json as { statut?: string }).statut === "admis", true);
  }

  titre("Cycle annuel et certification (écritures)");
  // Édition de classe par le chef : capacité relevée puis visible au tableau de bord.
  const edition = await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S`, { capacite: 47, enseignantPrincipalId: null });
  verifier("Directrice : édition de la capacité d'une classe", edition.statut, 200, `capacité ${edition.json.capacite}`);
  // Conseil de passage : la séance est attestée au registre (fait CONSEIL_DE_CLASSE), puis l'admis est
  // réinscrit dans sa division de l'année suivante (fait PASSAGE + REPRISE).
  const passage = await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2027-2028",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: ["Professeur principal de 5e A", "Chef de l'établissement"], referencePv: "PV-REC-01" },
    decisions: [{ apprenantId: "APP-000001", decision: "admis" }],
  });
  verifier("Directrice : conseil de passage (admis réinscrit)", [201, 422].includes(passage.statut), true, `statut ${passage.statut}${passage.statut === 422 ? " — apprenant déjà muté d'une exécution précédente" : ""}`);
  verifier("Directrice : la séance du conseil est au registre avec ses membres", passage.statut !== 201 || passage.json?.nombreDeMembres === 2, true, `membres ${passage.json?.nombreDeMembres}`);
  verifier("Directrice : une séance future est refusée", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2028-2029",
    seance: { dateSeance: "2099-01-01", membres: ["Chef de l'établissement"], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  verifier("Directrice : une séance sans membre est refusée", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2028-2029",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: [], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  // Révocation d'un diplôme par l'autorité de certification, puis vérification publique qui rend « révoqué ».
  // Le motif est un FAIT du registre (REVOCATION_CERTIFICAT), consultable par un agent habilité : il nomme
  // l'autorité qui a rendu le verdict — la DEC du MEMP pour un CEP. « ONEC » est ivoirien et n'organise
  // rien au Bénin ; le rendre ici, ce serait installer un sigle faux dans la trace elle-même.
  const revo = await central!.appel("POST", "/certificats/CERT-CEP-2024-000001/revocation", { motif: "Fraude établie par la DEC-MEMP (recette)" });
  verifier("Administration centrale : révocation d'un diplôme", [200, 409].includes(revo.statut), true, `statut ${revo.statut}`);
  const apresRevocation = await anonyme.appel("GET", "/certificats/CERT-CEP-2024-000001/verification");
  verifier("Public : diplôme révoqué → statut « revoque »", (apresRevocation.json as { statut?: string }).statut === "revoque", true);
}

titre("Enseignement supérieur : catalogue public, portes et intégrité (lecture et refus)");
{
  const IFRI = "ETB-SUP-UAC-IFRI";
  const filieres = await anonyme.appel("GET", "/public/superieur/filieres");
  verifier("Public : catalogue des filières", filieres.statut, 200, `${liste(filieres.json).length} filière(s)`);
  verifier("Public : chaque filière dit si elle est habilitée", liste(filieres.json).length > 0 && liste(filieres.json).every((f) => typeof f.habilitee === "boolean"), true);
  verifier("Public : filière non habilitée signalée (établissement privé en instruction)", liste(filieres.json).some((f) => f.habilitee === false), true);
  verifier("Public : établissements du supérieur", (await anonyme.appel("GET", "/public/superieur/etablissements")).statut, 200);
  verifier("Public : sessions de concours", (await anonyme.appel("GET", "/public/superieur/concours")).statut, 200);
  verifier("Public : les universités figurent dans l'annuaire", (await anonyme.appel("GET", "/public/etablissements?niveau=superieur")).json.total as number > 0, true);

  const [dirIfri, etudiantIfri, enseignanteSup] = await Promise.all(["prosper.ahouandjinou", "etudiant.ifri", "sena.hounkpatin"].map(async (id) => {
    const s = new Session();
    verifier(`Connexion ${id}`, (await s.connexion(id)).statut, 200);
    return s;
  }));
  verifier("Direction IFRI : ses inscriptions", (await dirIfri!.appel("GET", `/etablissements/${IFRI}/inscriptions`)).statut, 200);
  verifier("Direction IFRI : inscriptions d'une autre université", (await dirIfri!.appel("GET", "/etablissements/ETB-SUP-UP/inscriptions")).statut, 403);
  verifier("Directrice de CEG : inscriptions de l'IFRI", (await directrice!.appel("GET", `/etablissements/${IFRI}/inscriptions`)).statut, 403);
  verifier("Bureau du supérieur : catalogue de pilotage", (await central!.appel("GET", "/enseignement-superieur/filieres")).statut, 200);
  verifier("Étudiant·e : catalogue de pilotage refusé", (await etudiantIfri!.appel("GET", "/enseignement-superieur/filieres")).statut, 403);
  verifier("Étudiant·e : son contrat pédagogique", (await etudiantIfri!.appel("GET", "/moi/contrat")).statut, 200);
  verifier("Étudiant·e : ses démarches", (await etudiantIfri!.appel("GET", "/moi/actes")).statut, 200);
  verifier("Enseignante : notes d'une offre d'une autre enseignante refusées", (await enseignanteSup!.appel("POST", "/moi/enseignements/notes-ue", { offreUeId: "OFU-inexistante", notes: [{ apprenantId: "APP-900001", note: 12 }] })).statut, 404);

  // Failles corrigées : une règle ou un jury ne se réaffecte pas d'un périmètre à l'autre (refus AVANT toute écriture).
  const regle = { regleId: "RGL-NATIONALE-LMD", portee: "etablissement", etablissementId: IFRI, seuilAcquisition: 8 };
  verifier("Direction IFRI : reprendre la règle nationale en la redéclarant chez soi", (await dirIfri!.appel("POST", "/regles-validation", regle)).statut, 403);
  verifier("Direction IFRI : déclarer une règle nationale", (await dirIfri!.appel("POST", "/regles-validation", { portee: "nationale" })).statut, 403);
  const jurys = liste((await dirIfri!.appel("GET", `/etablissements/${IFRI}/jurys`)).json);
  if (jurys[0]) {
    const j = jurys[0];
    verifier("Direction IFRI : réaffecter un jury à une autre filière", (await dirIfri!.appel("POST", `/etablissements/${IFRI}/jurys`, {
      juryId: j.id, autorite: j.autorite, office: j.office, diplome: j.diplome, periodeId: null, filiereId: "FIL-UAC-IFRI-M-INFO",
      president: "Pr Test RECETTE", membres: ["A. Un", "B. Deux"], quorum: 3, statut: j.statut,
    })).statut, 403);
    verifier("Direction de CEG : délibérer pour l'IFRI", (await directrice!.appel("POST", `/etablissements/${IFRI}/deliberations`, { juryId: j.id, decisions: [{ apprenantId: "APP-900001", decision: "admis" }] })).statut, 403);
  }
  // Diplôme du supérieur : l'identifiant seul atteste l'existence, jamais le titulaire.
  const delib = liste((await dirIfri!.appel("GET", `/etablissements/${IFRI}/deliberations`)).json);
  const certificat = delib.map((d) => (d.deliberation as { certificatId?: string } | undefined)?.certificatId ?? d.certificatId).find((x): x is string => typeof x === "string");
  if (certificat) {
    const v = await anonyme.appel("GET", `/certificats/${certificat}/verification`);
    verifier("Licence délivrée : vérifiable, titulaire non révélé sans QR", (v.json as { statut?: string; titulaire?: string }).statut === "sans_empreinte" && !(v.json as { titulaire?: string }).titulaire, true, certificat);
  }
  const actes = liste((await etudiantIfri!.appel("GET", "/moi/actes")).json);
  const pret = actes.find((a) => a.statut === "disponible" || a.statut === "remise");
  if (pret) verifier("Acte scellé : vérification publique", (await anonyme.appel("GET", `/actes/${pret.id}/verification`)).statut, 200);
  if (ECRITURES && pret?.statut === "disponible") {
    // Double scellé refusé : un acte « disponible » ne se rescelle pas (le premier document deviendrait « altéré »).
    verifier("Guichet : sceller deux fois le même acte", (await dirIfri!.appel("POST", `/etablissements/${IFRI}/actes/${pret.id}/decision`, { statut: "disponible" })).statut, 409);
  }
}

titre("Interopérabilité : connecteurs signés des systèmes partenaires");
if (!process.env.BEILE_PARTENAIRES) {
  console.log("   (BEILE_PARTENAIRES absent : connecteurs non provisionnés, cas ignorés)");
} else {
  const { envoyer } = await import("./client-interop");
  const absence = { etablissementId: PILOTE, classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, absents: ["0000000000"] };
  verifier("Signature fausse → 401", (await envoyer("educmaster", "/interop/educmaster/absences", absence, { secret: "x".repeat(40) })).statut, 401);
  verifier("Horodatage périmé (rejeu d'une requête capturée) → 401", (await envoyer("educmaster", "/interop/educmaster/absences", absence, { horodatage: Date.now() - 3_600_000 })).statut, 401);
  verifier("Sans en-têtes de partenaire → 401", (await anonyme.appel("POST", "/interop/educmaster/absences", absence)).statut, 401);
  {
    // Message signé pour une route, présenté sur une autre : la signature couvre méthode et chemin.
    const { signer } = await import("./interop");
    const { secretDe } = await import("./client-interop");
    const corpsPub = JSON.stringify({ examen: "CEP", session: "Juin 2024" }), h = Date.now(), lot = `LOT-DETOURNE-${h}`;
    const sig = signer(secretDe("eresultats"), "POST", "/interop/eresultats/pv-examen", h, lot, corpsPub);
    const r = await fetch(`${(await import("./client-recette")).BASE}/interop/eresultats/publication`, { method: "POST", headers: { "content-type": "application/json", "x-beile-partenaire": "eresultats", "x-beile-horodatage": String(h), "x-beile-lot": lot, "x-beile-signature": sig }, body: corpsPub });
    verifier("Signature d'une autre route (détournement) → 401", r.status, 401);
  }
  verifier("EducMaster → message réservé à eRESULTATS : 403", (await envoyer("educmaster", "/interop/eresultats/publication", { examen: "CEP", session: "Juin 2024" })).statut, 403);
  verifier("DBAU → PV de diplôme de l'université : 403", (await envoyer("dbau", "/interop/uac/pv-diplome", {})).statut, 403);
  verifier("Message mal formé (partenaire authentifié) → 422", (await envoyer("educmaster", "/interop/educmaster/absences", { classeId: 12 })).statut, 422);
  verifier("UAC → filière d'une autre université : 403", (await envoyer("uac", "/interop/uac/pv-diplome", { pvReference: "PV-RECETTE", filiereId: "FIL-UP-L-DROIT", anneeUniversitaire: "2025-2026", decisions: [{ npi: "0000000000", decision: "admis", creditsValides: 180, moyenne: 12 }] })).statut, 403);
  if (ECRITURES) {
    // NPI déterministe du premier étudiant du référentiel du supérieur (APP-900001) : aucun saut silencieux.
    const lot = `REC-${Date.now()}`;
    const corps = { anneeUniversitaire: "2026-2027", decisions: [{ npi: "2910900001", typeDecision: "retablissement", statutCompte: "demi_boursier", referenceActe: "Arrêté DBAU recette", decideLe: "2026-09-27" }] };
    const premier = await envoyer("dbau", "/interop/dbau/allocations", corps, { lot });
    verifier("DBAU → décision d'allocation reçue par le connecteur", premier.statut === 201 && premier.json.enregistres === 1, true, `HTTP ${premier.statut}`);
    verifier("Rejeu du même lot → rien ne se double", (await envoyer("dbau", "/interop/dbau/allocations", corps, { lot })).json.deja === true, true);
  }
}

titre("Sécurité des comptes : second facteur, élévation, inactivité, vigie");
{
  // Second facteur exigé des administrateurs de niveau 0 à 2 : sans lui, rien n'est servi.
  const brute = new Session();
  const r = await brute.appel("POST", "/auth/connexion", { identifiant: "admin.beile", motDePasse: COMPTES["admin.beile"] });
  verifier("Autorité : après le mot de passe, second facteur à présenter", r.json.etape === "mfa_a_verifier", true, String(r.json.etape));
  verifier("Sans second facteur : données refusées (« mfa_a_verifier »)", (await brute.appel("GET", "/delegation/moi")).json.code === "mfa_a_verifier", true);
  verifier("Code faux : refusé", (await brute.appel("POST", "/auth/mfa/verifier", { code: "000000" })).statut, 422);
  const code = await codeFrais("admin.beile");
  verifier("Code juste : second facteur accepté", (await brute.appel("POST", "/auth/mfa/verifier", { code })).statut, 200);
  verifier("Session complète : données servies", (await brute.appel("GET", "/delegation/moi")).statut, 200);
  const rejeu = new Session();
  await rejeu.appel("POST", "/auth/connexion", { identifiant: "admin.beile", motDePasse: COMPTES["admin.beile"] });
  verifier("Rejeu du même code TOTP sur une autre session : refusé", (await rejeu.appel("POST", "/auth/mfa/verifier", { code })).statut, 422);
  verifier("Élévation : un code de secours n'est pas accepté", (await brute.appel("POST", "/auth/elevation", { code: "abcde12345" })).statut, 422);
  verifier("Élévation : mot de passe faux refusé (compte sans second facteur)", (await directrice!.appel("POST", "/auth/elevation", { motDePasse: "Faux-Mot-De-Passe-1" })).statut, 422);
  const etatMfa = await brute.appel("GET", "/auth/mfa/etat");
  verifier("État du second facteur : application enregistrée, codes de secours disponibles", etatMfa.json.totp === true && Number(etatMfa.json.codesSecoursRestants) > 0, true);
  verifier("Enseignant (sans délégation) : second facteur non exigé", (await enseignant!.appel("GET", "/auth/mfa/etat")).json.exige === false, true);
  // Comptes de démonstration (jury) : le code est rendu après le mot de passe, et il fonctionne.
  const demo = new Session();
  await demo.appel("POST", "/auth/connexion", { identifiant: "admin.beile", motDePasse: COMPTES["admin.beile"] });
  const codeDemo = await demo.appel("GET", "/auth/mfa/demonstration");
  verifier("Compte de démonstration : code affiché après le mot de passe", codeDemo.statut === 200 && /^\d{6}$/.test(String(codeDemo.json.code)), true, `HTTP ${codeDemo.statut}`);
  const attente = Number(codeDemo.json.valableDans ?? 0);
  if (attente > 0) await new Promise((r) => setTimeout(r, attente * 1000 + 300));
  verifier("Compte de démonstration : ce code ouvre la session", (await demo.appel("POST", "/auth/mfa/verifier", { code: String(codeDemo.json.code) })).statut, 200);
  verifier("Compte sans second facteur : aucun code rendu (404)", (await enseignant!.appel("GET", "/auth/mfa/demonstration")).statut, 404);
  verifier("Sans session : aucun code rendu (401)", (await new Session().appel("GET", "/auth/mfa/demonstration")).statut, 401);
  verifier("Témoin : route libre inexistante → 404", (await brute.appel("GET", "/auth/mfa/inexistant")).statut, 404);

  // Vigie : consultation réservée ; une rafale de refus lève une alerte.
  verifier("Enseignant → alertes de sécurité : 403", (await enseignant!.appel("GET", "/securite/alertes")).statut, 403);
  for (let i = 0; i < 9; i++) await enseignant!.appel("GET", "/etablissements/ETB-PAR-PILOTE-EPP/tableau");
  const alertes = await dpo!.appel("GET", "/securite/alertes");
  verifier("DPO : alerte « refus en rafale » levée par la vigie", liste(alertes.json).some((a) => a.type === "refus_en_rafale"), true, `${liste(alertes.json).length} alerte(s) ouverte(s)`);
  const exp = await dpo!.appel("GET", "/securite/alertes/export");
  verifier("DPO : export pour notification d'incident (bjCSIRT)", exp.statut === 200 && Array.isArray(exp.json.evenements), true);

  verifier("Directrice : écriture d'administration sans élévation → 403 « elevation_requise »", ((await directrice!.appel("POST", "/delegation/comptes", { nomAffiche: "Sans Elevation", fonction: "Professeur", role: "enseignant", organisationId: "ORG-ETB-ETB-PAR-PILOTE-CEG" })).json.code) === "elevation_requise", true);
  for (const [nom, s] of [["Directrice (mot de passe)", directrice], ["Direction départementale (second facteur)", departement], ["Cabinet (second facteur)", central], ["Autorité (second facteur)", admin]] as const) {
    verifier(`${nom} : élévation juste à temps`, (await s!.elever()).statut, 200);
  }
}

if (ECRITURES && (process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL)) {
  titre("Activation et récupération par code (SMS, courriel)");
  // Recette seulement : le fournisseur « journal » (hors production) garde le message ; on y lit le code.
  const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
  const dernierCode = async (compteId: string) => {
    const [m] = await db.select({ texte: schema.messagesSortants.texte }).from(schema.messagesSortants).where(eq(schema.messagesSortants.compteId, compteId)).orderBy(desc(schema.messagesSortants.creeLe)).limit(1);
    return /est (\d{6})\./.exec(m?.texte ?? "")?.[1] ?? "";
  };
  const canaux = await anonyme.appel("GET", "/auth/canaux");
  verifier("Canaux d'envoi ouverts (fournisseur « journal » hors production)", canaux.json.sms === true && canaux.json.courriel === true, true);
  const orgs = await departement!.appel("GET", "/delegation/organisations?parent=ORG-DD-MESTFP-borgou");
  const etab = liste(orgs.json.enfants).find((o) => o.id !== "ORG-ETB-ETB-PAR-PILOTE-CEG")?.id as string;
  const nouveau = await departement!.appel("POST", "/delegation/comptes", { nomAffiche: "Activation Recette Code", fonction: "Directeur", role: "chef_etablissement", organisationId: etab, npi: await npiLibre(), telephone: "+229 01 97 00 00 01" });
  const n = nouveau.json as unknown as { compte?: { id: string; identifiant: string }; activation?: { canal: string }; motDePasseTemporaire?: string };
  verifier("Compte créé avec un téléphone : activation autonome, aucun mot de passe montré à l'administrateur", nouveau.statut === 201 && n.activation?.canal === "sms" && !n.motDePasseTemporaire, true, `HTTP ${nouveau.statut}`);
  const id = n.compte?.identifiant ?? "", cid = n.compte?.id ?? "";
  const generique = await anonyme.appel("POST", "/auth/code/demande", { identifiant: "personne.inexistante", objet: "activation" });
  const demande = await anonyme.appel("POST", "/auth/code/demande", { identifiant: id, objet: "activation" });
  verifier("Demande de code : réponse identique que le compte existe ou non (pas d'énumération)", JSON.stringify(generique.json) === JSON.stringify(demande.json) && demande.statut === 200, true);
  const code = await dernierCode(cid);
  verifier("Code d'activation envoyé par SMS", /^\d{6}$/.test(code), true);
  const MDP = "Activation-Recette-2026";
  verifier("Code faux : refusé", (await anonyme.appel("POST", "/auth/code/confirmer", { identifiant: id, code: code === "000000" ? "111111" : "000000", nouveau: MDP })).statut, 422);
  verifier("Mot de passe trop faible : refusé", (await anonyme.appel("POST", "/auth/code/confirmer", { identifiant: id, code, nouveau: "faible" })).statut, 422);
  verifier("Code juste : compte activé avec le mot de passe choisi", (await anonyme.appel("POST", "/auth/code/confirmer", { identifiant: id, code, nouveau: MDP })).statut, 200);
  verifier("Code déjà utilisé : refusé", (await anonyme.appel("POST", "/auth/code/confirmer", { identifiant: id, code, nouveau: MDP })).statut, 422);
  const active = new Session();
  const cx = await active.connexion(id, MDP);
  verifier("Compte activé : connexion directe, aucune étape restante", cx.statut === 200 && cx.json.etape === null, true, String(cx.json.etape));
  const [cpt] = await db.select({ v: schema.comptes.telephoneVerifie }).from(schema.comptes).where(eq(schema.comptes.id, cid));
  verifier("Téléphone vérifié par l'activation", cpt?.v === true, true);

  verifier("Mot de passe oublié : demande de code acceptée", (await anonyme.appel("POST", "/auth/code/demande", { identifiant: id, objet: "recuperation" })).statut, 200);
  const codeRec = await dernierCode(cid);
  const MDP2 = "Recuperation-Recette-2026";
  verifier("Mot de passe oublié : récupération par code", (await anonyme.appel("POST", "/auth/code/confirmer", { identifiant: id, code: codeRec, nouveau: MDP2 })).statut, 200);
  verifier("Récupération : l'ancien mot de passe ne passe plus", (await new Session().connexion(id, MDP)).statut, 401);
  verifier("Récupération : le nouveau mot de passe passe", (await new Session().connexion(id, MDP2)).statut, 200);
  verifier("Récupération : les sessions ouvertes avant sont coupées", (await active.appel("GET", "/auth/session")).statut, 401);

  // Mot de passe initial : tant qu'il n'est pas changé, l'API ne sert rien d'autre (plus seulement l'écran).
  // Une personne sans compte : un enseignant du CEG, à défaut un responsable légal d'un de ses élèves.
  const [libre] = (await client`select e.npi, 'enseignant' as role from core.enseignants e where e.etablissement_id = 'ETB-PAR-PILOTE-CEG' and not exists (select 1 from core.profils p where p.npi = e.npi)
    union all select l.responsable_npi, 'parent' from core.liens_familiaux l join core.scolarites x on x.apprenant_id = l.apprenant_id where x.etablissement_id = 'ETB-PAR-PILOTE-CEG' and not exists (select 1 from core.profils p where p.npi = l.responsable_npi)
    limit 1`) as unknown as { npi: string; role: "enseignant" | "parent" }[];
  const provisoire = await directrice!.appel("POST", "/delegation/comptes", { nomAffiche: "Provisoire Recette", fonction: "Recette", role: libre?.role ?? "enseignant", organisationId: "ORG-ETB-ETB-PAR-PILOTE-CEG", npi: libre?.npi });
  const lecture = libre?.role === "parent" ? "/famille/enfants" : "/moi/classes";
  const p = provisoire.json as unknown as { compte?: { identifiant: string }; motDePasseTemporaire?: string };
  const sp = new Session();
  const cxp = await sp.connexion(p.compte?.identifiant ?? "", p.motDePasseTemporaire ?? "");
  verifier("Mot de passe provisoire : étape « mot_de_passe » annoncée", cxp.json.etape === "mot_de_passe", true, `HTTP ${provisoire.statut} · ${String(cxp.json.etape)}`);
  verifier("Mot de passe provisoire : données refusées par l'API (« mot_de_passe_a_changer »)", (await sp.appel("GET", lecture)).json.code === "mot_de_passe_a_changer", true);
  verifier("Changement du mot de passe initial", (await sp.appel("POST", "/auth/mot-de-passe", { actuel: p.motDePasseTemporaire, nouveau: "Enseignant-Recette-2026" })).statut, 200);
  verifier("Après changement : données servies aussitôt", (await sp.appel("GET", lecture)).statut, 200);

  // Coordonnée de récupération ajoutée par l'utilisateur : adoptée seulement si le code revient.
  const cEns = await db.select({ id: schema.comptes.id }).from(schema.comptes).where(eq(schema.comptes.identifiant, "idrissou.sanni"));
  verifier("Enseignant : changer de coordonnée sans reconfirmer son identité → refusé", (await enseignant!.appel("POST", "/moi/coordonnees/demande", { canal: "courriel", destination: "idrissou.sanni@exemple.bj" })).json.code === "elevation_requise", true);
  verifier("Enseignant : élévation par mot de passe", (await enseignant!.elever()).statut, 200);
  verifier("Enseignant : ajout d'un courriel de récupération (code envoyé)", (await enseignant!.appel("POST", "/moi/coordonnees/demande", { canal: "courriel", destination: "idrissou.sanni@exemple.bj" })).statut, 200);
  verifier("Code faux : coordonnée non adoptée", (await enseignant!.appel("POST", "/moi/coordonnees/confirmer", { code: "000000" })).statut, 422);
  const codeVerif = await dernierCode(cEns[0]!.id);
  verifier("Code juste : courriel vérifié", (await enseignant!.appel("POST", "/moi/coordonnees/confirmer", { code: codeVerif })).statut, 200);
  const coord = await enseignant!.appel("GET", "/moi/coordonnees");
  verifier("Coordonnées affichées masquées et vérifiées", (coord.json.courriel as { valeur?: string; verifie?: boolean } | null)?.verifie === true && !String((coord.json.courriel as { valeur?: string }).valeur).includes("idrissou.sanni@"), true);

  // Inactivité : une session sans interaction depuis plus de 2 h est close à la requête suivante.
  const dormeuse = new Session();
  await dormeuse.connexion("aicha.zannou");
  const [cptA] = await db.select({ id: schema.comptes.id }).from(schema.comptes).where(eq(schema.comptes.identifiant, "aicha.zannou"));
  await db.update(schema.sessions).set({ derniereActivite: new Date(Date.now() - 3 * 3600_000) }).where(and(eq(schema.sessions.compteId, cptA!.id), eq(schema.sessions.revoquee, false)));
  const endormie = await dormeuse.appel("GET", "/moi/passeport");
  verifier("Session inactive depuis 3 h : close (« inactivite »)", endormie.statut === 401 && endormie.json.code === "inactivite", true, `HTTP ${endormie.statut}`);
  await client.end();
}

titre("Administration déléguée (cascade, plafond, cumul, double validation)");
{
  const CEG = "ORG-ETB-ETB-PAR-PILOTE-CEG", BORGOU = "ORG-DD-MESTFP-borgou";
  const moi = await directrice!.appel("GET", "/delegation/moi");
  verifier("Directrice : délégation de niveau 3 sur son établissement", liste(moi.json.delegations)[0]?.niveau === 3, true);
  const orgs = await departement!.appel("GET", `/delegation/organisations?parent=${BORGOU}`);
  const autre = liste(orgs.json.enfants).find((o) => o.id !== CEG)?.id as string | undefined;
  verifier("Direction départementale : parcours de son sous-arbre", orgs.statut === 200 && !!autre, true, `HTTP ${orgs.statut}`);
  verifier("Directrice → compte dans un autre établissement : 403", (await directrice!.appel("POST", "/delegation/comptes", { nomAffiche: "Hors Perimetre", fonction: "Professeur", role: "enseignant", organisationId: autre })).statut, 403);
  verifier("Directrice → rôle au-dessus de son plafond (inspecteur) : 403", (await directrice!.appel("POST", "/delegation/comptes", { nomAffiche: "Inspecteur Indu", fonction: "Inspecteur", role: "inspecteur", organisationId: CEG })).statut, 403);
  verifier("Directrice → rôle attribué à elle-même : 403", (await directrice!.appel("POST", "/delegation/attributions", { profilId: "p-directeur", role: "enseignant", organisationId: CEG, motif: "Auto-attribution" })).statut, 403);
  verifier("Direction → nomination à son propre niveau : 403", (await departement!.appel("POST", "/delegation/delegations", { profilId: "p-inspecteur", organisationId: BORGOU, motif: "Même niveau" })).statut, 403);
  verifier("Direction du Borgou → comptes du Zou : 403", (await departement!.appel("GET", "/delegation/comptes?organisation=ORG-DD-MESTFP-zou")).statut, 403);
  verifier("DPO + délégation d'administration : 422", (await admin!.appel("POST", "/delegation/delegations", { profilId: "p-dpo", organisationId: "ORG-MIN-MEMP", motif: "Cumul interdit" })).statut, 422);
  verifier("Profil sans délégation → création de compte : 403", (await dpo!.appel("POST", "/delegation/comptes", { nomAffiche: "Quelqu'un Test", fonction: "Test", role: "enseignant", organisationId: CEG })).statut, 403);
  const comptes = await directrice!.appel("GET", `/delegation/comptes?organisation=${CEG}`);
  const soi = liste(comptes.json).find((c) => c.id === "p-directeur");
  verifier("Directrice : ses propres droits ne sont pas gérables", (soi?.attributions as { gerable: boolean }[] | undefined)?.every((a) => !a.gerable) ?? false, true);
  // Audit : un compte parent ne se crée que là où un enfant de ce NPI est scolarisé.
  verifier("Directrice → compte parent pour un adulte sans enfant dans son établissement : 422", (await directrice!.appel("POST", "/delegation/comptes", { nomAffiche: "Parent Hors Etablissement", fonction: "Parent", role: "parent", organisationId: CEG, npi: "1000000001" })).statut, [409, 422]);
  // Audit : l'administrateur de la plateforme ne s'ajoute pas de droits, et ne réinitialise pas un compte privilégié.
  const comptesAdm = liste((await admin!.appel("GET", "/admin/comptes")).json);
  const moiAdm = comptesAdm.find((x) => x.identifiant === "admin.beile")?.id as string | undefined;
  const cabinet = comptesAdm.find((x) => x.identifiant === "felicite.akakpo")?.id as string | undefined;
  verifier("Administrateur : s'ajouter le rôle DPO → refusé", moiAdm ? (await admin!.appel("POST", `/admin/comptes/${moiAdm}/profil`, { habilitations: [{ role: "administrateur", perimetre: { niveau: "national" } }, { role: "dpo", perimetre: { niveau: "national" } }] })).statut : 0, 422);
  verifier("Administrateur : mot de passe d'un compte privilégié (cabinet) → refusé, alerte", cabinet ? (await admin!.appel("POST", `/admin/comptes/${cabinet}/reinitialiser`)).statut : 0, 422);
  verifier("Registre national : nom seul (sans prénom) → refusé", (await directrice!.appel("GET", "/registre/personnes?nom=WOROU")).statut, 422);
  if (ECRITURES) {
    const n2 = await central!.appel("POST", "/delegation/delegations", { profilId: "p-inspecteur", organisationId: "ORG-DD-MESTFP-zou", motif: "Administrateur départemental du Zou" });
    verifier("Cabinet → nomination de niveau 2 en attente de seconde validation", n2.statut === 201 && n2.json.statut === "en_attente", true, `HTTP ${n2.statut}`);
    verifier("Le demandeur ne valide pas sa propre demande : 403", (await central!.appel("POST", `/delegation/delegations/${n2.json.id}/valider`)).statut, 403);
    const valide = await admin!.appel("POST", `/delegation/delegations/${n2.json.id}/valider`);
    verifier("Autorité (niveau 0) : seconde validation", valide.statut === 200 && valide.json.statut === "active", true, `HTTP ${valide.statut}`);
    // Remise en état : le compte de test de l'inspecteur ne reste pas administrateur de niveau 2.
    verifier("Autorité : révocation de la délégation de recette", (await admin!.appel("POST", `/delegation/delegations/${n2.json.id}/revoquer`, { motif: "Fin de la recette" })).statut, 200);
    const cree = await departement!.appel("POST", "/delegation/comptes", { nomAffiche: "Chef Recette Delegation", fonction: "Directeur", role: "chef_etablissement", organisationId: autre, npi: await npiLibre() });
    verifier("Contrôle : compte sans NPI refusé (pas de compte fantôme)", (await departement!.appel("POST", "/delegation/comptes", { nomAffiche: "Fantome Sans Npi", fonction: "Directeur", role: "chef_etablissement", organisationId: autre })).statut, 422);
    verifier("Direction → compte de chef d'établissement dans son sous-arbre", cree.statut, 201, String(cree.json.erreur ?? ""));
    if (cree.statut === 201) {
      const nouveau = new Session();
      const cr = cree.json as unknown as { compte: { identifiant: string }; motDePasseTemporaire: string; profilId: string };
      verifier("Nouveau compte : connexion avec le mot de passe provisoire", (await nouveau.connexion(cr.compte.identifiant, cr.motDePasseTemporaire)).statut, 200);
      const ligne = liste((await departement!.appel("GET", `/delegation/comptes?organisation=${autre}`)).json).find((c) => c.id === cr.profilId);
      const att = (ligne?.attributions as { id: string }[] | undefined)?.[0]?.id;
      verifier("Révocation d'un rôle par la direction", (await departement!.appel("POST", `/delegation/attributions/${att}/revoquer`, { motif: "Fin de la recette" })).statut, 200);
      verifier("Révocation : la session du compte est coupée", (await nouveau.appel("GET", "/auth/session")).statut, 401);
    }
  }
}

titre("Fin de session");
verifier("Déconnexion", (await enseignant!.appel("POST", "/auth/deconnexion")).statut, 200);
verifier("Session révoquée côté serveur", (await enseignant!.appel("GET", "/auth/session")).statut, 401);

console.log(`\n${cas - echecs}/${cas} cas conformes${ECRITURES ? " (avec écritures)" : " (lecture et refus uniquement)"}.`);
process.exit(echecs ? 1 : 0);
