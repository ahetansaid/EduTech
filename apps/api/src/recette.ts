import { TYPES_FAITS_FRAIS } from "@beile/contracts";
import { connecter, schema } from "@beile/db";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
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
const FAITS_FRAIS = new Set<string>(TYPES_FAITS_FRAIS);

/**
 * Les clés d'une réponse qui désigneraient une somme, une dette, un moyen de paiement ou un compte bancaire.
 * BEILE ne transporte que la trace d'une pièce existée : la présence d'une telle clé est une régression du
 * cadrage, pas une nuance d'affichage. La comparaison se mot à mot — le camelCase est découpé AVANT la mise
 * en minuscules (sinon `[A-Z]` ne matche plus rien), et les accents sont neutralisés (sinon « règlement » se
 * coupe en « rè » + « glement »). Le vocabulaire reste borné aux mots qui ne désignent jamais autre chose
 * qu'une somme dans cette plateforme : `total`, `reste` et `carte` y sont employés pour des comptes d'élèves,
 * des délais ou une carte d'étudiant, et les inclure ferait échouer la recette à tort.
 */
const MONTANT = new Set(["montant", "montants", "somme", "sommes", "prix", "solde", "dette", "impaye", "impayes", "rib", "iban", "bic", "devise", "fcfa", "echeancier", "moyen", "paiement", "paye", "due", "avance", "avances", "reglement", "tarif", "tarifs", "bareme", "encaisse", "encaissement", "caisse", "cheque", "cheques", "espece", "liquidation"]);
function clefsMontant(j: unknown, chemin = ""): string[] {
  if (Array.isArray(j)) return j.flatMap((x) => clefsMontant(x, chemin));
  if (j && typeof j === "object") return Object.entries(j).flatMap(([k, v]) => {
    const mots = k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z]+/).filter(Boolean);
    return [...(mots.some((m) => MONTANT.has(m) || MONTANT.has(`${m}s`)) ? [`${chemin}${k}`] : []), ...clefsMontant(v, `${chemin}${k}.`)];
  });
  return [];
}
/**
 * Une réponse qui porterait une devise (CFA, francs CFA, euro, dollar) dans l'un de ses textes aurait trahi le
 * cadrage. Le juge ne peut pas être plus souple que la règle : la liste reprend celle de `DEVISE` (`commun.ts`),
 * mêmes bornes de mot, mêmes symboles — une réponse que `sansSomme` refuserait à l'écriture doit lever ici.
 */
const DEVISE_SCAN = /(^|[^a-zà-ÿ])(cfa|fcfa|f\.?c\.?f\.?a|francs? cfa|euros?|dollars?|nairas?)([^a-zà-ÿ]|$)|[€$£]/gi;
const deviseDansLeTexte = (j: unknown): number => (JSON.stringify(j ?? null).match(DEVISE_SCAN) ?? []).length;

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
// Audit du 28/10 : le préfixe LOT- des lots partenaires ne s'occupe pas depuis un compte interne (refus avant toute écriture).
verifier("Clé de saisie au préfixe réservé LOT- → 422", (await enseignant!.appel("POST", "/evenements/absences", { ...absence, idSaisie: "LOT-99999999" })).statut, 422);

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
verifier("Transfert par un enseignant", (await enseignant!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: "CLS-COT-5eA-S", motif: "Recette : déménagement de la famille" })).statut, 403);
verifier("Changement de classe par un enseignant", (await enseignant!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: "CLS-PAR-5eA-S", motif: "Recette : rééquilibrage des effectifs" })).statut, 403);
verifier("Directrice : changement vers une classe d'un autre niveau → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: "CLS-PAR-3eA-S", motif: "Recette : rééquilibrage des effectifs" })).statut, 422);
verifier("Directrice : transfert sans motif → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: "CLS-COT-5eA-S" })).statut, 422);
verifier("Directrice : transferts de son école", (await directrice!.appel("GET", `/etablissements/${PILOTE}/transferts`)).statut, 200);
verifier("Directrice : transferts d'une autre école", (await directrice!.appel("GET", "/etablissements/ETB-COT-PILOTE-CEG/transferts")).statut, 403);
verifier("Inspecteur : transferts à arbitrer", (await inspecteur!.appel("GET", "/transferts/inspection")).statut, 200);
verifier("Directrice : transferts à arbitrer (inspection seulement)", (await directrice!.appel("GET", "/transferts/inspection")).statut, 403);
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
verifier("Type d'évaluation hors liste : 422", (await enseignant!.appel("POST", "/evenements/evaluations", { classeId: "CLS-PAR-5eA-S", matiere: "Mathématiques", trimestre: 2, typeEvaluation: "examen_blanc", notes: [{ apprenantId: "APP-000001", note: 12 }] })).statut, 422);
verifier("Note hors barème (21/20)", (await enseignant!.appel("POST", "/evenements/evaluations", { classeId: "CLS-PAR-5eA-S", matiere: "Mathématiques", trimestre: 2, notes: [{ apprenantId: "APP-000001", note: 21 }] })).statut, 422);
{
  // Trimestre de référence : une seule règle, qui dit sa source (calendrier de l'année, sinon dernier trimestre saisi).
  const carnet = await enseignant!.appel("GET", "/classes/CLS-PAR-5eA-S");
  const p = carnet.json?.periode as { anneeScolaire?: string; trimestre?: number; source?: string } | null;
  verifier("Carnet : le trimestre affiché dit son année et sa source", !!p && p.trimestre === carnet.json.trimestre && ["calendrier", "notes", "defaut"].includes(p.source ?? ""), true, JSON.stringify(p));
  const demain = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  verifier("Appel daté d'un jour à venir → 422", (await enseignant!.appel("POST", "/evenements/absences", { classeId: "CLS-PAR-5eA-S", date: demain, apprenantIds: ["APP-000001"] })).statut, 422);
  const bul = await directrice!.appel("GET", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/bulletins`);
  verifier("Directrice : bulletins de toute une classe, au trimestre de référence", bul.statut === 200 && Array.isArray(bul.json?.bulletins) && bul.json.trimestre === (bul.json.periode as { trimestre?: number } | null)?.trimestre, true, `HTTP ${bul.statut}`);
  verifier("Enseignant : bulletins de classe refusés (gestion de l'établissement)", (await enseignant!.appel("GET", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/bulletins`)).statut, 403);
  verifier("Appel daté d'un jour inexistant (31 février) → 422", (await enseignant!.appel("POST", "/evenements/absences", { classeId: "CLS-PAR-5eA-S", date: "2026-02-31", apprenantIds: ["APP-000001"] })).statut, 422);
}
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
verifier("Pilotage : l'origine des chiffres est déclarée (simulation ou registre)", ["simulation", "registre"].includes(String((await central!.appel("GET", "/pilotage/origine")).json?.indicateurs)), true);
verifier("Hors tutelle → qualité des remontées refusée", (await enseignant!.appel("GET", "/plateforme/qualite")).statut, 403);
verifier("Hors tutelle → recoupement refusé", (await enseignant!.appel("GET", "/plateforme/recoupement")).statut, 403);
verifier("Inspection → recoupement de son périmètre", (await inspecteur!.appel("GET", "/plateforme/recoupement")).statut, 200);
verifier("Dictionnaire national : public par choix (aucune donnée personnelle)", (await anonyme.appel("GET", "/dictionnaire")).statut, 200);
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

titre("Visites d'inspection et trace des consultations (refus : aucune écriture)");
// Porte de tutelle : hors agents de tutelle, rien ne se lit et rien ne se consigne — et chaque refus part au journal.
verifier("Sans session → lecture des visites", (await anonyme.appel("GET", "/visites")).statut, 401);
verifier("Apprenante → lecture des visites du périmètre", (await apprenante!.appel("GET", "/visites")).statut, 403);
verifier("Cheffe d'établissement → couverture d'inspection", (await directrice!.appel("GET", "/visites/couverture")).statut, 403);
verifier("Enseignant → consigner une visite", (await enseignant!.appel("POST", "/visites", {
  etablissementId: PILOTE, dateVisite: AUJOURDHUI, objet: "Essai hors tutelle", constats: "Constats de la recette, sans valeur pédagogique.",
  recommandations: null, referenceRapport: null, prochaineVisiteLe: null, cle: "00000000-0000-4000-8000-000000000001",
})).statut, 403);
const feuille = (sur: Record<string, unknown>) => ({
  etablissementId: PILOTE, dateVisite: AUJOURDHUI, objet: "Visite de recette", constats: "Constats de recette, aucune donnée transmise.",
  recommandations: null, referenceRapport: null, prochaineVisiteLe: null, cle: "00000000-0000-4000-8000-000000000002", ...sur,
});
verifier("Inspecteur → visite à une date future (le registre ne s'efface pas)", (await inspecteur!.appel("POST", "/visites", feuille({ dateVisite: "2099-01-01" }))).statut, 422);
verifier("Inspecteur → date impossible (31 février)", (await inspecteur!.appel("POST", "/visites", feuille({ dateVisite: `${new Date().getFullYear()}-02-31` }))).statut, 422);
verifier("Inspecteur → visite annoncée avant la visite consignée", (await inspecteur!.appel("POST", "/visites", feuille({ prochaineVisiteLe: AUJOURDHUI }))).statut, 422);
verifier("Inspecteur → établissement hors de sa circonscription", (await inspecteur!.appel("POST", "/visites", feuille({ etablissementId: "ETB-COT-PILOTE-CEG" }))).statut, 403);
verifier("Inspecteur → lecture des visites de sa circonscription", (await inspecteur!.appel("GET", "/visites")).statut, 200);
// La couverture est comptée et triée PAR la base : le plafond de la réponse ne doit rien changer au décompte,
// sinon l'agent lirait « 200 écoles attendues » là où son territoire en compte mille.
const couverture = await inspecteur!.appel("GET", "/visites/couverture?cycle=secondaire&limite=5");
verifier("Inspecteur → couverture d'inspection (cycle et plafond)", couverture.statut, 200,
  `${couverture.json?.attendus ?? "?"} écoles · ${couverture.json?.couverts ?? "?"} visitées · ${String(couverture.json?.tronque)} · ${liste(couverture.json?.etablissements).length} rendues`);
verifier("Inspecteur → le plafond borne la liste, jamais le décompte",
  (couverture.json?.couverts ?? 1) <= (couverture.json?.attendus ?? 0) && liste(couverture.json?.etablissements).length <= 5, true);
// « Qui a consulté mes données ? » : la fenêtre bornée du sujet, jamais celle d'un tiers.
verifier("Sans session → trace de ses consultations", (await anonyme.appel("GET", "/droits/mes-consultations")).statut, 401);
verifier("Apprenante → trace des consultations d'un autre dossier", (await apprenante!.appel("GET", "/droits/mes-consultations?sujet=APP-000002")).statut, 403);
const traceSoi = await apprenante!.appel("GET", "/droits/mes-consultations");
verifier("Apprenante → sa propre trace, fenêtre de douze mois", traceSoi.statut, 200, `bornée au ${String(traceSoi.json?.depuis ?? "").slice(0, 10)}`);

titre("Frais scolaires : qui lit, qui écrit (refus : aucune écriture au registre)");
// Un fait nominatif de frais ne descend qu'auprès du responsable légal dont le lien de filiation est vérifié au
// registre, et de l'administration de l'école qui scolarise l'élève. Ni l'enseignant, ni la tutelle, ni l'élève
// mineur, ni un compte d'une autre école. Et la forme du contrat refuse une somme à la porte, pas à l'écran.
const STATUTS_FRAIS = ["couvert", "exonere", "attendu", "en_cours", "sans_declaration"];
const dossiers = liste(enfants.json);
// Le bloc `frais` du dossier est le livrable de l'espace famille : il doit arriver avec l'enfant, sans appel
// supplémentaire. Le cas se joue sur un enfant qui en porte un, pas sur un enfant hors scolarité.
const enfantAvecFrais = dossiers.find((d) => d.frais != null);
verifier("Espace famille : le dossier d'un enfant scolarisé porte son bloc de frais", enfantAvecFrais !== undefined, true, `${dossiers.length} enfant(s) rattaché(s)`);
const eleveDeLaFamille = String((enfantAvecFrais?.apprenant as { id?: string } | undefined)?.id ?? "APP-000001");
const monPasseport = await apprenante!.appel("GET", "/moi/passeport");
const monIdEleve = String((monPasseport.json?.apprenant as { id?: string } | undefined)?.id ?? "");
verifier("Passeport de l'élève : son propre identifiant est connu", /^APP-\d{6}$/.test(monIdEleve), true, monIdEleve);
verifier("Sans session → situation d'un élève", (await anonyme.appel("GET", `/apprenants/${eleveDeLaFamille}/frais`)).statut, 401);
verifier("Sans session → état de rapprochement d'une école", (await anonyme.appel("GET", `/etablissements/${PILOTE}/frais`)).statut, 401);
verifier("Enseignant → frais d'un élève de sa classe", (await enseignant!.appel("GET", "/apprenants/APP-000001/frais")).statut, 403);
verifier("Enseignant → frais d'un élève inexistant : même refus, aucune existence dénombrable", (await enseignant!.appel("GET", "/apprenants/APP-999999/frais")).statut, 403);
verifier("Inspection → frais d'un élève de son périmètre", (await inspecteur!.appel("GET", `/apprenants/${eleveDeLaFamille}/frais`)).statut, 403);
verifier("Inspection → état de rapprochement de l'école de son périmètre", (await inspecteur!.appel("GET", `/etablissements/${PILOTE}/frais`)).statut, 403);
verifier("Direction départementale → état de rapprochement de l'école", (await departement!.appel("GET", `/etablissements/${PILOTE}/frais`)).statut, 403);
verifier("L'élève lui-même → ses propres traces de frais", (await apprenante!.appel("GET", `/apprenants/${monIdEleve}/frais`)).statut, 403);
// Règle 2 du cadrage, côté écriture : personne d'autre que le compte d'administration de l'école qui scolarise
// l'élève ne consigne un fait. Le parent, même au lien vérifié, déclare une pièce — il ne l'émet pas.
verifier("Parent → consigner une quittance pour son enfant", (await parent!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/quittance`, { anneeScolaire: "2026-2027", terme: "T1", delivreeLe: AUJOURDHUI, referenceQuittance: "REC-ESSAI-PARENT", qualiteAgent: "intendance", agent: null, cle: randomUUID() })).statut, 403);
verifier("Élève → consigner sa propre exonération", (await apprenante!.appel("POST", `/apprenants/${monIdEleve}/frais/exoneration`, { anneeScolaire: "2026-2027", terme: "T1", nature: "exoneration", motif: "Essai de l'élève", autorite: "Élève", referenceTexte: "Décision n°001/2026 du conseil d'administration", decideLe: AUJOURDHUI, cle: randomUUID() })).statut, 403);
const vueFamille = await parent!.appel("GET", `/apprenants/${eleveDeLaFamille}/frais`);
const statutFamille = (vueFamille.json?.situation as { statut?: string } | undefined)?.statut ?? "";
verifier("Parent au lien vérifié → situation complète de son enfant", vueFamille.statut === 200 && vueFamille.json?.situation != null && STATUTS_FRAIS.includes(statutFamille), true, `statut ${statutFamille || "aucun"}`);
const vueEcole = await directrice!.appel("GET", `/etablissements/${PILOTE}/frais`);
verifier("Administration de l'école → état de rapprochement", vueEcole.statut, 200,
  `${liste(vueEcole.json?.lignes).length} ligne(s) · ${String(vueEcole.json?.effectif)} élève(s) scolarisés`);
verifier("Parent → état de rapprochement de l'école", (await parent!.appel("GET", `/etablissements/${PILOTE}/frais`)).statut, 403);
verifier("École qu'il n'administre pas → état de rapprochement refusé", (await directrice!.appel("GET", "/etablissements/ETB-COT-PILOTE-CEG/frais")).statut, 403);
verifier("Année qu'aucune classe de l'école n'a ouverte → 422", (await directrice!.appel("GET", `/etablissements/${PILOTE}/frais?anneeScolaire=1999-2000`)).statut, 422);
// L'invariant « aucun montant » se vérifie mécaniquement, sur la réponse entière : aucune clé ne désigne une
// somme, une dette, un moyen de paiement ou un identifiant bancaire, aucune valeur ne porte une devise. Le
// contrôle exige une réponse peuplée — un scan sur un tableau vide est vert sans rien regarder.
const enfantServe = liste(enfants.json).length;
verifier("Aucun montant dans la lecture d'une famille", vueFamille.statut === 200 && vueFamille.json?.situation != null && clefsMontant(vueFamille.json).length + deviseDansLeTexte(vueFamille.json) === 0, true, clefsMontant(vueFamille.json).join(", "));
verifier("Aucun montant dans l'état lu par l'école", vueEcole.statut === 200 && clefsMontant(vueEcole.json).length + deviseDansLeTexte(vueEcole.json) === 0, true, clefsMontant(vueEcole.json).join(", "));
verifier("Aucun montant dans l'espace famille", enfantServe > 0 && clefsMontant(enfants.json).length + deviseDansLeTexte(enfants.json) === 0, true, `${enfantServe} enfant(s) lu(s)`);
// Le dossier général reste une liste de parcours : les faits de frais en sont retirés avant la réponse, sous
// quelque finalité que ce soit — une date de quittance y suffirait à faire état d'une situation de paiement.
const dossierGeneral = await directrice!.appel("GET", "/apprenants/APP-000001?finalite=gestion");
const typesDuDossier = liste(dossierGeneral.json?.parcours).map((e) => String(e.type));
verifier("Dossier général servi et peuplé, aucun fait de frais n'y descend", dossierGeneral.statut === 200 && typesDuDossier.length > 0 && typesDuDossier.every((t) => !FAITS_FRAIS.has(t)), true, `${typesDuDossier.length} fait(s) au parcours`);
// Règle 2, troisième audience fermée : le pilotage. Le filtre est en base (pas après coup), et il s'applique
// avant toute écriture de recette — un flux propre se prouve sur la base réelle, pas seulement sur une branche
// où la recette vient de consigner ses propres pièces.
const fluxLu = await central!.appel("GET", "/pilotage/flux?limite=30");
const typesFlus = [...liste(fluxLu.json?.parType).map((t) => String(t.type)), ...liste(fluxLu.json?.derniers).map((e) => String(e.type))];
verifier("Flux du pilotage (base réelle) : servi, peuplé, sans aucun fait de frais", fluxLu.statut === 200 && typesFlus.length > 0 && typesFlus.every((t) => !FAITS_FRAIS.has(t)), true, `${typesFlus.length} type(s) vus`);
const fluxDepartement = await departement!.appel("GET", "/pilotage/flux?limite=30");
verifier("Flux d'une direction départementale : même cloisonnement", fluxDepartement.statut === 200 && [...liste(fluxDepartement.json?.parType), ...liste(fluxDepartement.json?.derniers)].every((x) => !FAITS_FRAIS.has(String(x.type))), true, `${liste(fluxDepartement.json?.derniers).length} fait(s) listé(s)`);
// Un compte sans école administrée est écarté AVANT toute lecture en base : sans ce garde, un enseignant
// parcourrait APP-000001, APP-000002… en distinguant « non scolarisé » (409) de « hors périmètre » (403).
const essaiPiece = { anneeScolaire: String(vueEcole.json?.anneeScolaire ?? "2026-2027"), terme: "T1", delivreeLe: AUJOURDHUI, referenceQuittance: "REC-TEST-FORME", qualiteAgent: "intendance", agent: null, cle: randomUUID() };
const essaiMesure = { anneeScolaire: String(vueEcole.json?.anneeScolaire ?? "2026-2027"), terme: "T1", nature: "exoneration", motif: "Essai de forme pour la recette", autorite: "Conseil d'administration", referenceTexte: "Décision n°001/2026 du conseil d'administration", decideLe: AUJOURDHUI, cle: randomUUID() };
verifier("Enseignant → consigner une quittance", (await enseignant!.appel("POST", "/apprenants/APP-000001/frais/quittance", essaiPiece)).statut, 403);
verifier("Enseignant → quittance sur un élève inexistant : même refus, rien n'est dénombrable", (await enseignant!.appel("POST", "/apprenants/APP-999999/frais/quittance", essaiPiece)).statut, 403);
verifier("Enseignant → consigner une exonération", (await enseignant!.appel("POST", "/apprenants/APP-000001/frais/exoneration", essaiMesure)).statut, 403);
verifier("Enseignant → exonération sur un élève inexistant : même refus, rien n'est dénombrable", (await enseignant!.appel("POST", "/apprenants/APP-999999/frais/exoneration", essaiMesure)).statut, 403);
verifier("Enseignant → déclarer la cadence d'une école", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, { anneeScolaire: essaiPiece.anneeScolaire, termes: [{ terme: "T1", exigibleLe: AUJOURDHUI }], cadre: "Acquittement à l'intendance du collège.", referenceDeliberation: null, cle: randomUUID() })).statut, 403);
verifier("Sans session → consigner une quittance", (await anonyme.appel("POST", "/apprenants/APP-000001/frais/quittance", essaiPiece)).statut, 401);
verifier("Sans session → consigner une exonération", (await anonyme.appel("POST", "/apprenants/APP-000001/frais/exoneration", essaiMesure)).statut, 401);
verifier("Sans session → déclarer la cadence d'une école", (await anonyme.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, { anneeScolaire: essaiPiece.anneeScolaire, termes: [{ terme: "T1", exigibleLe: AUJOURDHUI }], cadre: "Acquittement à l'intendance du collège.", referenceDeliberation: null, cle: randomUUID() })).statut, 401);
// La réclamation « j'ai payé, rien n'est enregistré » se dépose au nom de l'enfant, par le responsable légal au
// lien vérifié. L'école elle-même ne dépose pas à la place de la famille : ce serait effacer la contradiction qui
// fait tout l'intérêt du rapprochement. Ces cas ne demandent qu'un refus, donc n'écrivent rien.
const essaiReclamation = { anneeScolaire: String(vueEcole.json?.anneeScolaire ?? "2026-2027"), terme: "T1", texte: "Quittance remise à l'intendance du collège, aucune trace n'apparaît au registre." };
verifier("Sans session → déposer une réclamation", (await anonyme.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, essaiReclamation)).statut, 401);
verifier("Enseignant → déposer une réclamation pour un élève de sa classe", (await enseignant!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, essaiReclamation)).statut, 403);
verifier("Enseignant → réclamation sur un élève inexistant : même refus, rien n'est dénombrable", (await enseignant!.appel("POST", "/apprenants/APP-999999/frais/reclamation", essaiReclamation)).statut, 403);
verifier("Inspection → déposer une réclamation pour un élève de son périmètre", (await inspecteur!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, essaiReclamation)).statut, 403);
verifier("Administration de l'école → elle n'écrit pas la réclamation à la place de la famille", (await directrice!.appel("POST", "/apprenants/APP-999999/frais/reclamation", essaiReclamation)).statut, 403);
verifier("L'élève lui-même → sa propre réclamation de frais", (await apprenante!.appel("POST", `/apprenants/${monIdEleve}/frais/reclamation`, essaiReclamation)).statut, 403);
verifier("Parent → réclamation pour un élève qui n'est pas le sien : même refus", (await parent!.appel("POST", "/apprenants/APP-999999/frais/reclamation", essaiReclamation)).statut, 403);
verifier("Texte de réclamation nommant une devise → 422, rien n'est écrit", (await parent!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, { ...essaiReclamation, texte: "J'ai versé 15 000 FCFA à l'intendance, aucune quittance au registre." })).statut, 422);
verifier("Texte trop court pour décrire une pièce → 422", (await parent!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, { ...essaiReclamation, texte: "Payé." })).statut, 422);
verifier("Réclamation portant un montant → refusée par le contrat", (await parent!.appel("POST", `/apprenants/${eleveDeLaFamille}/frais/reclamation`, { ...essaiReclamation, montant: 15000 })).statut, 422);
if (vueEcole.statut === 200 && vueEcole.json?.anneeScolaire) {
  verifier("Quittance portant un montant → refusée par le contrat", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), montant: 15000 })).statut, 422);
  verifier("Appel déclarant une somme par terme → refusé par le contrat", (await directrice!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, { anneeScolaire: essaiPiece.anneeScolaire, termes: [{ terme: "T1", exigibleLe: AUJOURDHUI, montant: 15000 }], cadre: "Acquittement à l'intendance du collège, trois termes.", referenceDeliberation: null, cle: randomUUID() })).statut, 422);
  // La clé `montant` est fermée par le contrat ; le texte libre de l'agent ne l'était pas. Un cadre qui nomme
  // une devise fait entrer au registre national ce qu'il ne doit pas contenir — refusé à l'écriture, pas à l'écran.
  verifier("Cadre de l'appel écrivant une somme en toutes lettres → 422", (await directrice!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, { anneeScolaire: essaiPiece.anneeScolaire, termes: [{ terme: "T1", exigibleLe: AUJOURDHUI }], cadre: "Quinze mille francs CFA par terme, à l'intendance.", referenceDeliberation: null, cle: randomUUID() })).statut, 422);
  verifier("Motif d'exonération chiffré en devise → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/exoneration", { ...essaiMesure, cle: randomUUID(), motif: "Exonération de 15 000 FCFA accordée par le conseil" })).statut, 422);
  verifier("Quittance signée d'un jour à venir → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), delivreeLe: "2099-01-01" })).statut, 422);
  verifier("Quittance « autre agent » sans fonction précise → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), qualiteAgent: "autre" })).statut, 422);
  verifier("Terme hors nomenclature (T4) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), terme: "T4" })).statut, 422);
  verifier("Identifiant d'élève mal formé → 422, rien n'est écrit", (await directrice!.appel("POST", "/apprenants/APP-1/frais/quittance", { ...essaiPiece, cle: randomUUID() })).statut, 422);
  // Audit du 28/10 (frais) : référence sans montant, année de l'école, acte exigé pour une exonération, annulation.
  verifier("Référence de quittance portant un montant (15000FCFA-T1) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), referenceQuittance: "15000FCFA-T1" })).statut, 422);
  verifier("Référence de quittance au montant séparé (T1 15 000 F) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), referenceQuittance: "T1 15 000 F" })).statut, 422);
  verifier("Référence de quittance au petit montant (500F) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), referenceQuittance: "500F" })).statut, 422);
  verifier("Devise contournée (15 000 XOF) dans un motif → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/exoneration", { ...essaiMesure, cle: randomUUID(), motif: "Remise de 15 000 XOF décidée" })).statut, 422);
  verifier("Année où l'école n'a aucune classe (2001-2002) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), anneeScolaire: "2001-2002" })).statut, 422);
  verifier("Année aux millésimes non consécutifs (2026-2026) → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, cle: randomUUID(), anneeScolaire: "2026-2026" })).statut, 422);
  verifier("Exonération sans la référence de l'acte qui la fonde → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/exoneration", { ...essaiMesure, cle: randomUUID(), referenceTexte: undefined })).statut, 422);
  verifier("Enseignant → annuler une pièce de frais", (await enseignant!.appel("POST", "/apprenants/APP-000001/frais/annulation", { evenementId: `EVT-${randomUUID()}`, motif: "Essai de refus pour la recette", cle: randomUUID() })).statut, 403);
  verifier("Administration → annuler une pièce inexistante : même refus qu'une pièce d'une autre école", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/annulation", { evenementId: `EVT-${randomUUID()}`, motif: "Essai de refus pour la recette", cle: randomUUID() })).statut, 403);
  if (ECRITURES) {
    // Une pièce consignée par erreur s'annule : elle reste au registre, ne compte plus, et ne s'annule qu'une fois.
    const ref = `REC-ANNUL-${Date.now()}`;
    // Un terme que l'école appelle vraiment : sinon la pièce serait refusée (422) et l'annulation jamais jouée.
    const termeAppele = String((vueEcole.json?.cadence as { termes?: { terme: string }[] } | null)?.termes?.[0]?.terme ?? "T1");
    const p = await directrice!.appel("POST", "/apprenants/APP-000001/frais/quittance", { ...essaiPiece, terme: termeAppele, cle: randomUUID(), referenceQuittance: ref });
    verifier("Annulation : quittance d'essai consignée", p.statut, 201, `${p.statut} ${JSON.stringify(p.json).slice(0, 120)}`);
    if (p.statut === 201) {
      const idPiece = String(p.json.id);
      const avant = await directrice!.appel("GET", "/apprenants/APP-000001/frais");
      verifier("Avant annulation : la pièce figure dans la situation (témoin)", JSON.stringify(avant.json ?? {}).includes(idPiece), true);
      const cleAnnul = randomUUID();
      verifier("Annulation d'une pièce consignée par erreur → 201", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/annulation", { evenementId: idPiece, motif: "Recette : quittance saisie sur un homonyme", cle: cleAnnul })).statut, 201);
      const rejeu = await directrice!.appel("POST", "/apprenants/APP-000001/frais/annulation", { evenementId: idPiece, motif: "Recette : quittance saisie sur un homonyme", cle: cleAnnul });
      verifier("Rejeu du même envoi d'annulation → rendu tel quel (deja)", rejeu.statut === 200 && rejeu.json.deja === true, true, `${rejeu.statut}`);
      verifier("Seconde annulation de la même pièce (autre envoi) → 409", (await directrice!.appel("POST", "/apprenants/APP-000001/frais/annulation", { evenementId: idPiece, motif: "Recette : quittance saisie sur un homonyme", cle: randomUUID() })).statut, 409);
      const apres = await directrice!.appel("GET", "/apprenants/APP-000001/frais");
      verifier("La pièce annulée ne compte plus dans la situation (son identifiant a disparu)", !JSON.stringify(apres.json ?? {}).includes(idPiece), true);
    }
  }
} else {
  // Le chemin « non joué » n'est jamais vert tout seul : s'il y est arrivé, c'est que la lecture de l'école a
  // échoué, et il faut que la recette le dise comme une anomalie plutôt que comme une convenance.
  verifier("Formes de contrat non jouées : l'école pilote devait rendre une année d'exercice", vueEcole.statut === 200 && vueEcole.json?.anneeScolaire == null && liste(vueEcole.json?.annees).length === 0, true, `${String(vueEcole.statut)} sans année déclarée`);
}

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
  const correction = { evenementCorrigeId: idNote, nouvelleNote: 15, motif: "Erreur de report", idSaisie: `RECETTE-CORR-${Date.now()}` };
  const corr1 = await enseignant!.appel("POST", "/evenements/corrections", correction);
  verifier("Enseignant : correction motivée", corr1.statut, 201);
  const corr2 = await enseignant!.appel("POST", "/evenements/corrections", correction);
  verifier("Correction rejouée (réponse perdue) : renvoyée, pas réécrite", corr2.statut === 200 && corr2.json.deja === true && corr2.json.enregistre === corr1.json.enregistre, true);
  const carnet = await enseignant!.appel("GET", "/classes/CLS-PAR-5eA-S");
  const note = liste(carnet.json.eleves).find((e) => e.id === "APP-000001")?.notes as { id: string; note: number; corrigee: boolean }[] | undefined;
  const corrigee = note?.find((n) => n.id === idNote);
  verifier("Carnet : la note effective est la note corrigée", corrigee?.note === 15 && corrigee.corrigee, true);

  const recherche = await directrice!.appel("GET", "/registre/personnes?nom=WOROU&prenoms=Sidonie");
  const sidonie = liste(recherche.json).find((p) => p.prenoms === "Sidonie") as { npi?: string } | undefined;
  verifier("Inscription par NPI (201, ou 409 si déjà inscrite)", (await directrice!.appel("POST", "/inscriptions", { classeId: "CLS-PAR-6eA-S", npi: sidonie?.npi ?? "0000000000" })).statut, [201, 409]);
  verifier("Proposition d'accompagnement (circuit de validation)", (await directrice!.appel("POST", `/etablissements/${PILOTE}/accompagnement`, { apprenantIds: ["APP-000001"], objet: "Soutien en mathématiques" })).statut, 201);
  verifier("Inscription à une formation (201, ou 409 si déjà inscrit)", (await enseignant!.appel("POST", "/moi/formations", { code: "EVAL-FORM-MATHS" })).statut, [201, 409]);

  // Transfert : une demande, rien ne bouge avant l'accord de l'accueil ; l'école de départ la retire.
  const accueil = liste((await directrice!.appel("GET", "/apprenants/APP-000001/classes-accueil")).json.classes).find((x) => Number(x.places) > 0);
  const demande = await directrice!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: String(accueil?.id ?? "CLS-COT-5eA-S"), motif: "Recette : déménagement de la famille" });
  verifier("Transfert : demande adressée à l'école d'accueil", demande.statut, 201);
  const demandeId = String(demande.json.demandeId ?? "DEM-inconnue");
  verifier("Transfert : seconde demande pour le même élève → 409", (await directrice!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: String(accueil?.id ?? "CLS-COT-5eA-S"), motif: "Recette : déménagement de la famille" })).statut, 409);
  verifier("Transfert : l'école de départ ne répond pas à la place de l'accueil", (await directrice!.appel("POST", `/transferts/${demandeId}/decision`, { decision: "accepte" })).statut, 403);
  verifier("Transfert : la décision générique de circuit est refusée", (await directrice!.appel("POST", `/demandes/${demandeId}/decision`, { decision: "valide" })).statut, [403, 409]);
  const dossierPendant = await directrice!.appel("GET", "/apprenants/APP-000001/dossier-gestion");
  verifier("Transfert en attente : l'élève reste dans son école", (dossierPendant.json.situation as { etablissementId?: string })?.etablissementId === PILOTE && !!dossierPendant.json.transfertEnAttente, true);
  verifier("Transfert : retrait par l'école de départ", (await directrice!.appel("POST", `/transferts/${demandeId}/retrait`, { motif: "Recette : la famille renonce au départ" })).statut, 200);
  verifier("Transfert : second retrait d'une demande déjà retirée → 409", (await directrice!.appel("POST", `/transferts/${demandeId}/retrait`, { motif: "Recette : la famille renonce au départ" })).statut, 409);

  // Le périmètre de l'inspection se filtre là où la file est lue, plus après coup dans la réponse. La propriété
  // vérifiée est celle qui compte : toute école qui apparaît dans sa file doit être une école dont il consulte déjà
  // les transferts. Aucun nom de circonscription n'est codé ici, donc le cas ne s'inverse pas si les comptes de
  // démonstration changent de périmètre.
  const seconde = await directrice!.appel("POST", "/apprenants/APP-000001/transfert", { versClasseId: String(accueil?.id ?? "CLS-COT-5eA-S"), motif: "Recette : contrôle du périmètre de l'inspection" });
  verifier("Transfert : une nouvelle demande est possible après retrait de la première", seconde.statut, 201);
  const secondeId = String(seconde.json.demandeId ?? "");
  const ecoleAccueil = String((liste((await directrice!.appel("GET", `/etablissements/${PILOTE}/transferts`)).json.sortants).find((x) => x.id === secondeId)?.vers as { id?: string } | undefined)?.id ?? "");
  verifier("Transfert : l'école d'accueil de la demande se lit dans la file de l'école", /^ETB-/.test(ecoleAccueil), true, secondeId);
  const aArbitrer = liste((await inspecteur!.appel("GET", "/transferts/inspection")).json.transferts);
  let horsPortee = 0;
  for (const x of aArbitrer.slice(0, 5)) {
    const vers = String((x.vers as { id?: string } | undefined)?.id ?? "");
    if (/^ETB-/.test(vers) && (await inspecteur!.appel("GET", `/etablissements/${vers}/transferts`)).statut !== 200) horsPortee++;
  }
  verifier("Inspection : sa file ne contient que des écoles qu'elle contrôle déjà", horsPortee, 0, `${aArbitrer.length} demande(s) dans la file`);
  verifier("Transfert : la file de l'inspection reste bornée", aArbitrer.length <= 200, true, `${aArbitrer.length} ligne(s)`);
  verifier("Transfert : retrait de la demande de contrôle", (await directrice!.appel("POST", `/transferts/${secondeId}/retrait`, { motif: "Recette : la demande de contrôle est retirée" })).statut, 200);

  // Changement de classe dans la même école. Le projet n'a qu'un seul compte d'administration d'établissement :
  // l'accord de l'école d'accueil et l'imposition par l'inspection ne peuvent donc pas être joués en succès ici.
  const classeOrigine = String((dossierPendant.json.situation as { classeId?: string } | undefined)?.classeId ?? "");
  const ailleurs = await directrice!.appel("GET", "/apprenants/APP-000001/classes-ecole");
  verifier("Directrice → classes de son école pour un changement", ailleurs.statut, 200);
  verifier("Changement de classe par l'inspection (hors administration de l'école)", (await inspecteur!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: "CLS-PAR-6eA-S", motif: "Recette : l'inspection ne réaffecte pas" })).statut, 403);
  verifier("Changement vers une classe d'un autre établissement → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: "CLS-COT-5eA-S", motif: "Recette : une autre école demande un transfert" })).statut, 422);
  verifier("Changement vers la classe où l'élève est déjà → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: classeOrigine, motif: "Recette : l'élève est déjà dans cette classe" })).statut, 422);
  verifier("Changement sans motif de 10 caractères au moins → 422", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: "CLS-PAR-6eA-S", motif: "court" })).statut, 422);
  const candidate = liste(ailleurs.json.classes).find((x) => Number(x.places) > 0);
  const classeActuelle = liste((await directrice!.appel("GET", `/etablissements/${PILOTE}/tableau`)).json.classes).find((x) => x.id === classeOrigine);
  // Une classe déjà au-dessus de sa capacité (constat §5 du cadrage) ne peut pas reprendre son élève : le retour
  // serait refusé pour surcapacité et l'élève resterait déplacé. On ne joue l'aller-retour que s'il est possible.
  const retourPossible = Number(classeActuelle?.effectif ?? 0) <= Number(classeActuelle?.capacite ?? 0);
  if (candidate && retourPossible) {
    // Aller et retour : la projection de scolarité et les places sont vérifiées sans déplacer l'élève durablement.
    verifier("Changement de classe effectif", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: String(candidate.id), motif: "Recette : rééquilibrage des effectifs" })).statut, 201);
    verifier("Changement : la scolarité suit l'élève dans la classe d'arrivée", ((await directrice!.appel("GET", "/apprenants/APP-000001/dossier-gestion")).json.situation as { classeId?: string } | undefined)?.classeId === candidate.id, true);
    verifier("Changement : retour dans la classe d'origine", (await directrice!.appel("POST", "/apprenants/APP-000001/changement-classe", { versClasseId: classeOrigine, motif: "Recette : retour après contrôle de la projection" })).statut, 201);
  } else if (candidate) {
    verifier("Changement non joué : la surcapacité de la classe d'origine est déclarée à l'écran", Number(classeActuelle?.effectif ?? 0) > Number(classeActuelle?.capacite ?? 0), true, `${classeActuelle?.libelle} ${classeActuelle?.effectif}/${classeActuelle?.capacite}`);
  } else {
    verifier("Changement non joué : aucune classe de l'école avec une place libre", liste(ailleurs.json.classes).every((x) => Number(x.places) <= 0), true, `${liste(ailleurs.json.classes).length} classe(s) proposée(s)`);
  }

  titre("Frais scolaires : déclarer l'appel, consigner les pièces, rapprocher (écritures)");
  {
    // La saisie se fait sur un élève de la liste du jour, de préférence un enfant dont le lien de filiation est
    // vérifié : la trace de la pièce ne part en notification qu'à ce responsable-là, et le cas contrôle du même
    // coup le destinataire réel.
    const rattaches = new Set(liste(enfants.json).map((d) => String((d.apprenant as { id?: string } | undefined)?.id ?? "")));
    const premier = await directrice!.appel("GET", `/etablissements/${PILOTE}/frais`);
    const premieres = liste(premier.json?.lignes);
    const propose = premieres.find((l) => rattaches.has(String(l.apprenantId)) && !l.horsEffectif) ?? premieres.find((l) => !l.horsEffectif);
    // L'année que la recette écrit est celle que L'ÉLÈVE lit, non la dernière année où l'école a ouvert des
    // classes : les deux peuvent différer, et une pièce consignée sur l'autre année disparaîtrait des deux
    // écrans en restant parfaitement inscrite au registre.
    const vuePropose = propose ? await directrice!.appel("GET", `/apprenants/${String(propose.apprenantId)}/frais`) : null;
    const annee = String(vuePropose?.json?.anneeScolaire ?? "");
    // Relecture de l'état borné à cette année : cadence, lignes et effectifs sont ceux que les écritures vont
    // déplacer, et l'année demandée doit être une année que l'école reconnaît (422 sinon).
    const etat = annee ? await directrice!.appel("GET", `/etablissements/${PILOTE}/frais?anneeScolaire=${encodeURIComponent(annee)}`) : premier;
    const lignes = liste(etat.json?.lignes);
    const cible = lignes.find((l) => String(l.apprenantId) === String(propose?.apprenantId ?? "")) ?? null;
    const autre = lignes.find((l) => l !== cible && !l.horsEffectif);
    // Marqueur chiffré, et uniquement chiffré : il se glisse dans des textes que la route scanne (référence
    // d'une pièce, texte d'une réclamation, motif d'une réponse). Une lettre pourrait y composer un nom de
    // devise au hasard — « CFA » tient en base 36 — et le refus deviendrait un tirage. Des chiffres ne le peuvent pas.
    const marque = String(Date.now()).slice(-9);
    // Le cadre est du texte d'agent : comment on paie dans CETTE école. Ni somme ni devise — la recette le
    // vérifie plus bas sur la réponse entière, et le contrat refuserait la clé à l'écriture.
    const CADRE = "Droits tenus à l'intendance du collège, ou auprès du régisseur de recettes, contre pièce numérotée.";
    if (!annee || !cible || etat.json?.anneeScolaire !== annee) {
      verifier("Frais : l'année lue par l'élève est aussi celle que l'état de l'école rend", false, true, `élève ${String(propose?.apprenantId ?? "aucun")} · année ${annee || "aucune"} · état ${String(etat.json?.anneeScolaire ?? "aucun")} · ${lignes.length} ligne(s)`);
    } else {
      const id = String(cible.apprenantId);
      const passe = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const demain = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const situation = (j: unknown) => (j as { situation?: { statut?: string; termes?: unknown } } | undefined)?.situation;

      // 1) La régression que le statut ne doit jamais commettre : une pièce consignée alors que rien n'était
      //    appelé reste visible après coup. Recalculée seulement sur les termes appelés, elle aurait disparu des
      //    deux écrans — la famille détiendrait un papier que le registre prétendrait ne jamais avoir vu.
      if (etat.json?.cadence == null) {
        verifier("Aucun appel déclaré → consigner une pièce retrouvée", (await directrice!.appel("POST", `/apprenants/${id}/frais/quittance`, { anneeScolaire: annee, terme: "T3", delivreeLe: AUJOURDHUI, referenceQuittance: `REC-HORS-APPEL-${marque}`, qualiteAgent: "intendance", agent: null, cle: randomUUID() })).statut, 201);
        verifier("Appel déclaré après coup", (await directrice!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, { anneeScolaire: annee, termes: [{ terme: "T1", exigibleLe: passe }, { terme: "T2", exigibleLe: demain }], cadre: CADRE, referenceDeliberation: `CA-REC-${marque}`, cle: randomUUID() })).statut, 201);
        const relue = await directrice!.appel("GET", `/apprenants/${id}/frais`);
        const termesRelus = liste(situation(relue.json)?.termes);
        verifier("La pièce hors appel est rendue en « sans_appel », jamais effacée", termesRelus.some((t) => t.terme === "T3" && t.etat === "sans_appel"), true, `${termesRelus.length} terme(s) rendu(s)`);
        // Déterministe : T1 exigible au passé sans pièce, T2 dans le futur, la pièce T3 hors appel exclue du
        // calcul. Attendre les deux statuts aurait affaibli le cas en « à peu près ».
        verifier("Et le statut de l'année se calcule sur les seuls termes appelés", situation(relue.json)?.statut === "attendu", true, String(situation(relue.json)?.statut));
      } else {
        // Une cadence est déjà déclarée pour cette année (registre en ajout seul) : la consigne « avant l'appel »
        // ne peut plus être jouée. Ce qu'on contrôle à la place est un état réel du registre — rien ne doit être
        // rendu « sans_appel » quand tout a été appelé, sinon la ligne orpheline serait la norme.
        const relue = await directrice!.appel("GET", `/apprenants/${id}/frais`);
        const rendu = liste(situation(relue.json)?.termes);
        verifier("Cadence déjà déclarée : aucune ligne orpheline rendue « sans_appel »", rendu.length > 0 && rendu.every((t) => t.etat !== "sans_appel"), true, `${rendu.length} terme(s) rendu(s) · cadence du ${String((etat.json?.cadence as { declareeLe?: string } | undefined)?.declareeLe ?? "")}`);
      }

      // 2) La déclaration de l'année : des termes et des dates, libres à l'école, et aucune somme.
      const cleDeclaration = randomUUID();
      const declaration = { anneeScolaire: annee, termes: [{ terme: "T1", exigibleLe: passe }, { terme: "T2", exigibleLe: demain }], cadre: CADRE, referenceDeliberation: `CA-REC-${marque}`, cle: cleDeclaration };
      verifier("Déclaration de l'appel de l'année", (await directrice!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, declaration)).statut, 201);
      const rejouee = await directrice!.appel("POST", `/etablissements/${PILOTE}/frais/cadence`, declaration);
      verifier("Déclaration rejouée (réponse perdue) : renvoyée, pas réécrite", rejouee.statut === 200 && rejouee.json?.deja === true, true);

      // 3) Une école qui a appelé ses termes ne consigne pas de pièce pour un terme qu'elle n'a pas appelé.
      verifier("Pièce sur un terme non appelé → 422", (await directrice!.appel("POST", `/apprenants/${id}/frais/quittance`, { anneeScolaire: annee, terme: "ANNEE", delivreeLe: AUJOURDHUI, referenceQuittance: `REC-HORS-TERME-${marque}`, qualiteAgent: "intendance", agent: null, cle: randomUUID() })).statut, 422);

      // 3bis) La règle 1 du cadrage, jouée au moment précis où elle peut être violée : l'élève est là, exactement,
      //     en « attendu » — un terme exigible et aucune pièce. Rien ne se suspend : ni le bulletin de sa classe,
      //     ni le dossier que sa famille lit. Un jour, une note, un conseil, c'est la même réponse.
      const pendant = await directrice!.appel("GET", `/apprenants/${id}/frais`);
      verifier("Un terme exigible sans pièce rend l'année « attendu »", situation(pendant.json)?.statut === "attendu", true, String(situation(pendant.json)?.statut));
      const classeDeLEleve = String(liste((await directrice!.appel("GET", `/etablissements/${PILOTE}/eleves`)).json).find((e) => String(e.id) === id)?.classeId ?? "");
      if (/^CLS-[A-Za-z0-9-]+$/.test(classeDeLEleve)) {
        const bulletins = await directrice!.appel("GET", `/etablissements/${PILOTE}/classes/${classeDeLEleve}/bulletins`);
        verifier("« Attendu » ne suspend pas le bulletin : la classe s'imprime, l'élève y figure", bulletins.statut === 200 && liste(bulletins.json?.bulletins).some((b) => String((b.apprenant as { id?: string } | undefined)?.id) === id), true, `${liste(bulletins.json?.bulletins).length} bulletin(s) servi(s) · ${(bulletins.json as { classe?: { libelle?: string } }).classe?.libelle ?? "classe sans libellé"}`);
      } else {
        verifier("Bulletin non comparé : l'élève saisi ne porte aucune classe exploitable", liste((await directrice!.appel("GET", `/etablissements/${PILOTE}/eleves`)).json).some((e) => String(e.id) === id && String(e.classeId ?? "") !== ""), false);
      }
      if (rattaches.has(id)) {
        const suivi = await parent!.appel("GET", `/apprenants/${id}?finalite=suivi_familial`);
        verifier("« Attendu » ne suspend pas la lecture par la famille", suivi.statut === 200 && clefsMontant(suivi.json).length + deviseDansLeTexte(suivi.json) === 0, true, "dossier lu pendant l'attente");
      } else {
        verifier("Lecture famille non jouée : l'élève saisi n'est rattaché à aucun compte parent testé", rattaches.has(id), false);
      }

      // 3ter) La réclamation, jouée au moment où elle a un sens : l'élève est exactement `attendu` sur T1, aucune
      //     pièce au registre. Ce que l'école ne peut PAS faire, c'est la clore par un avis — la réponse `valide`
      //     exige la pièce consignée. Sans ce verrou, la réclamation deviendrait une promesse de paiement et le
      //     rapprochement un mot. L'ordre des gardes compte : l'autorisation d'abord, le domaine ensuite.
      let reclamation: string | null = null;
      if (rattaches.has(id)) {
        const depot = await parent!.appel("POST", `/apprenants/${id}/frais/reclamation`, { anneeScolaire: annee, terme: "T1", texte: `Quittance remise à l'intendance le ${AUJOURDHUI}, numéro ${marque} au carnet de reçus.` });
        reclamation = /^DEM-/.test(String(depot.json?.id ?? "")) ? String(depot.json?.id) : null;
        verifier("Famille → « j'ai payé, rien n'est enregistré »", depot.statut === 201 && reclamation !== null, true, `${depot.statut} · ${String(depot.json?.id ?? "aucun identifiant")}`);
        const rejoue = await parent!.appel("POST", `/apprenants/${id}/frais/reclamation`, { anneeScolaire: annee, terme: "T1", texte: "Second envoi : la réponse du premier s'est perdue en route." });
        verifier("Dépôt rejoué : la demande existante est rendue, pas empilée", rejoue.statut === 200 && rejoue.json?.deja === true && String(rejoue.json?.id ?? "") === String(reclamation ?? ""), true, String(rejoue.json?.id ?? rejoue.statut));
        verifier("Réclamation sur un terme que l'école n'a pas appelé → 422", (await parent!.appel("POST", `/apprenants/${id}/frais/reclamation`, { anneeScolaire: annee, terme: "ANNEE", texte: "L'année entière a été réglée à l'intendance, rien n'apparaît." })).statut, 422);
        if (reclamation) {
          verifier("Un enseignant ne statue pas sur la réclamation d'un élève", (await enseignant!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "refuse", motif: "Aucune pièce n'a été retrouvée au cahier de l'intendance." })).statut, 403);
          verifier("Réponse de l'école nommant une devise → 422, rien n'est écrit", (await directrice!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "refuse", motif: "Pièce de 15 000 FCFA introuvable au cahier de l'intendance." })).statut, 422);
          verifier("Réponse trop courte → 422 : une famille n'obtient pas un silence", (await directrice!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "refuse", motif: "Non." })).statut, 422);
          verifier("Renvoyer la réclamation à son dépôt → 422, aucune file ne la présente", (await directrice!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "renvoye", motif: "À redéposer avec le papier original de la quittance." })).statut, 422);
          verifier("Reconnaître sans pièce au registre → 422 : la réclamation ne se clos pas par un avis", (await directrice!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "valide", motif: "La famille est de bonne foi, nous la croyons sur parole." })).statut, 422);
        } else {
          verifier("Gardes de la réponse non jouées : le dépôt de la réclamation a échoué", depot.statut === 201, true, `${depot.statut} · ${String(depot.json?.message ?? "")}`);
        }
      } else {
        verifier("Réclamation non jouée : l'élève saisi n'est rattaché à aucun compte parent testé", rattaches.has(id), false);
      }

      // 4) La quittance, son idempotence, et le destinataire de la trace.
      const nonLuesAvant = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number } | undefined)?.nonLues ?? 0);
      const clePiece = randomUUID();
      const piece = { anneeScolaire: annee, terme: "T1", delivreeLe: AUJOURDHUI, referenceQuittance: `REC-${marque}-T1`, qualiteAgent: "regisseur_de_recettes", agent: null, cle: clePiece };
      verifier("Quittance du 1er terme consignée", (await directrice!.appel("POST", `/apprenants/${id}/frais/quittance`, piece)).statut, 201);
      const pieceRejoue = await directrice!.appel("POST", `/apprenants/${id}/frais/quittance`, piece);
      verifier("Quittance rejouée (même clé de saisie) : une seule ligne au registre", pieceRejoue.statut === 200 && pieceRejoue.json?.deja === true, true);
      if (rattaches.has(id)) {
        const nonLuesApres = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number } | undefined)?.nonLues ?? 0);
        verifier("La trace de la pièce part au responsable au lien vérifié", nonLuesApres > nonLuesAvant, true, `${nonLuesAvant} → ${nonLuesApres} non lue(s)`);
        const lues = liste((await parent!.appel("GET", "/moi/notifications")).json?.notifications);
        verifier("Et le message rendu au parent ne porte ni somme ni devise", lues.length > 0 && clefsMontant(lues).length + deviseDansLeTexte(lues) === 0, true, `${lues.length} notification(s)`);
      } else {
        verifier("Notification non jouable : l'élève saisi n'est pas rattaché au compte parent testé", rattaches.has(id), false);
      }
      // Règle 2 du même coup jouée du côté de l'élève : le bloc de frais de son propre passeport reste vide
      // (finalité `consultation_personnelle` non admise), et son téléphone ne reçoit rien — un téléphone d'élève
      // se prête en classe, et il n'a aucun devoir de paiement (loi n°2009-09 du 22/05/2009).
      const passeportApres = await apprenante!.appel("GET", "/moi/passeport");
      verifier("Passeport de l'élève : aucun bloc de frais, aucune somme", passeportApres.statut === 200 && passeportApres.json?.frais == null && liste(passeportApres.json?.evenements).every((e) => !FAITS_FRAIS.has(String(e.type))) && clefsMontant(passeportApres.json).length + deviseDansLeTexte(passeportApres.json) === 0, true, `${liste(passeportApres.json?.evenements).length} fait(s) au passeport`);
      if (id === monIdEleve) {
        const notifEleve = await apprenante!.appel("GET", "/moi/notifications");
        const textes = liste(notifEleve.json?.notifications).map((n) => `${String(n.titre ?? "")} ${String(n.texte ?? "")}`);
        verifier("Aucune trace de pièce sur le téléphone de l'élève", notifEleve.statut === 200 && textes.every((t) => !/quittance|frais|exonération|prise en charge/i.test(t)), true, `${textes.length} notification(s) lue(s)`);
      } else {
        verifier("Téléphone de l'élève non comparé : l'élève saisi est un autre compte que l'apprenante testée", id !== monIdEleve, true, `${id} · ${monIdEleve}`);
      }

      // 4bis) La pièce est au registre : la réclamation peut enfin être close en `valide`, et c'est la seule voie
      //     qui la ferme ainsi. La réponse part en notification écrite à la famille — sans somme, comme partout
      //     ailleurs dans BEILE. Et sa visibilité ne s'élargit pas : l'enseignant ne la lit pas plus qu'il ne la
      //     statue, la famille qui l'a déposée en lit le détail et l'historique des décisions.
      if (reclamation && rattaches.has(id)) {
        verifier("Un enseignant ne lit pas la réclamation d'un élève", (await enseignant!.appel("GET", `/demandes/${reclamation}`)).statut, 403);
        const nonLuesAvantReponse = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number } | undefined)?.nonLues ?? 0);
        const close = await directrice!.appel("POST", `/demandes/${reclamation}/decision`, { decision: "valide", motif: `Quittance ${marque} retrouvée au cahier de l'intendance et consignée ce jour.` });
        verifier("Pièce consignée → la réclamation est close, reconnue par l'école", close.statut === 200 && close.json?.statut === "acceptee", true, String(close.json?.statut ?? close.statut));
        const nonLuesApresReponse = Number(((await parent!.appel("GET", "/moi/notifications")).json as { nonLues?: number } | undefined)?.nonLues ?? 0);
        verifier("La réponse part en notification à la famille qui a déposé", nonLuesApresReponse > nonLuesAvantReponse, true, `${nonLuesAvantReponse} → ${nonLuesApresReponse} non lue(s)`);
        const detail = await parent!.appel("GET", `/demandes/${reclamation}`);
        verifier("La famille lit le détail de sa réclamation et les décisions rendues", detail.statut === 200 && liste(detail.json?.decisions).length >= 1 && clefsMontant(detail.json).length + deviseDansLeTexte(detail.json) === 0, true, `${liste(detail.json?.decisions).length} décision(s)`);
        const relueFamille = await parent!.appel("GET", `/apprenants/${id}/frais`);
        const miennes = liste(relueFamille.json?.reclamations);
        verifier("La famille relit sa réclamation close et la réponse écrite de l'école", relueFamille.statut === 200 && miennes.some((x) => String(x.id) === reclamation && String(x.statut) === "acceptee" && String((x.reponse as { motif?: string | null } | null)?.motif ?? "").includes(marque)), true, `${miennes.length} réclamation(s) rendue(s)`);
        verifier("Aucun montant dans les réclamations relues par la famille", miennes.length > 0 && clefsMontant(miennes).length + deviseDansLeTexte(miennes) === 0, true, `${miennes.length} réclamation(s) · ${clefsMontant(miennes).join(", ")}`);
        const relueEcole = await directrice!.appel("GET", `/etablissements/${PILOTE}/frais?anneeScolaire=${encodeURIComponent(annee)}`);
        const siennes = liste(relueEcole.json?.reclamations);
        verifier("L'école relit la réclamation close, le nom de l'élève y est joint", siennes.some((x) => String(x.id) === reclamation && String(x.nomApprenant ?? "") === String(cible.nom ?? "")), true, `${siennes.length} réclamation(s) à l'écran de l'école`);
        verifier("Aucun montant dans l'état de l'école après la réclamation", relueEcole.statut === 200 && clefsMontant(relueEcole.json).length + deviseDansLeTexte(relueEcole.json) === 0, true, `${siennes.length} réclamation(s) · ${liste(relueEcole.json?.lignes).length} ligne(s)`);
      }

      // 5) La vigie — seul contrôle anti-détournement possible sans montants : une même référence sur deux élèves,
      //    y compris recopiée dans un autre alphabet (« q-12 » et « Q 12 » sont le même carnet).
      if (autre) {
        const vers = String(autre.apprenantId);
        const doublon = await directrice!.appel("POST", `/apprenants/${vers}/frais/quittance`, { ...piece, cle: randomUUID() });
        verifier("Même référence pour un autre élève : consignée, vigie levée", doublon.statut === 201 && doublon.json?.alerte === "reference_deja_utilisee_dans_cette_ecole", true, String(doublon.json?.alerte));
        const recopiee = await directrice!.appel("POST", `/apprenants/${vers}/frais/quittance`, { ...piece, cle: randomUUID(), terme: "T2", referenceQuittance: `rec ${marque} t1` });
        verifier("Référence recopiée en minuscules et sans tirets : la vigie la reconnaît", recopiee.statut === 201 && recopiee.json?.alerte != null, true, String(recopiee.json?.alerte));
        // L'alerte est un fait de sécurité, pas un fait d'élève : elle se lit du seul côté du DPO (et de
        // l'administrateur), et son texte ne doit désigner aucun enfant — ni par son nom, ni par son identifiant.
        const alertes = await dpo!.appel("GET", "/securite/alertes?statut=ouvertes");
        const dupliees = liste(alertes.json).filter((a) => String(a.type) === "quittance_reference_dupliquee");
        verifier("Vigie : l'alerte de référence dupliquée est ouverte et lisible par le DPO", alertes.statut === 200 && dupliees.length >= 1 && dupliees.every((a) => String(a.gravite) === "haute"), true, `${dupliees.length} alerte(s)`);
        verifier("Et sa teneur ne nomme aucun apprenant", dupliees.length > 0 && dupliees.every((a) => !/APP-\d{6}/.test(String(a.detail ?? ""))), true, `${String((alertes.json as unknown[] | undefined)?.length ?? 0)} alerte(s) ouverte(s) au total`);
        const mesure = await directrice!.appel("POST", `/apprenants/${vers}/frais/exoneration`, { anneeScolaire: annee, terme: null, nature: "exoneration", motif: "Exonération accordée par le conseil d'administration", autorite: "Conseil d'administration de l'établissement", referenceTexte: "Décision n°001/2026 du conseil d'administration", decideLe: AUJOURDHUI, cle: randomUUID() });
        verifier("Exonération de l'année entière (mesure sans terme)", mesure.statut, 201);
        const couverte = await directrice!.appel("GET", `/apprenants/${vers}/frais`);
        verifier("Une mesure annuelle couvre les termes appelés, pièces déjà consignées comprises", situation(couverte.json)?.statut === "exonere", true, String(situation(couverte.json)?.statut));
      } else {
        verifier("Vigie et mesure annuelle non jouables : un seul élève sur la liste du jour", lignes.filter((l) => !l.horsEffectif).length, 1);
      }

      // 6) La prise en charge ferme l'année de l'élève : la mesure remplace la pièce attendue, à l'écran de
      //    l'école comme à celui de la famille, sans que rien n'ait jamais été encaissé ici.
      verifier("Prise en charge du 2e terme consignée", (await directrice!.appel("POST", `/apprenants/${id}/frais/exoneration`, { anneeScolaire: annee, terme: "T2", nature: "prise_en_charge", motif: "Prise en charge déclarée par l'école", autorite: "Chef d'établissement", referenceTexte: "Décision n°001/2026 du conseil d'administration", decideLe: AUJOURDHUI, cle: randomUUID() })).statut, 201);
      const finale = await directrice!.appel("GET", `/apprenants/${id}/frais`);
      verifier("Termes appelés tous couverts (pièce + mesure)", situation(finale.json)?.statut === "couvert", true, String(situation(finale.json)?.statut));
      verifier("Aucun montant dans la situation après écritures", finale.statut === 200 && clefsMontant(finale.json).length + deviseDansLeTexte(finale.json) === 0, true, `${liste(situation(finale.json)?.termes).length} terme(s) rendu(s)`);
      // Relire l'espace famille APRÈS les écritures : l'invariant ne doit rien à un état vierge. Et la famille
      // doit lire le même statut que l'école — deux projections du même registre, pas deux calculs.
      const familleApres = await parent!.appel("GET", "/famille/enfants");
      verifier("Aucun montant dans l'espace famille après écritures", familleApres.statut === 200 && liste(familleApres.json).length > 0 && clefsMontant(familleApres.json).length + deviseDansLeTexte(familleApres.json) === 0, true, `${liste(familleApres.json).length} enfant(s) · ${clefsMontant(familleApres.json).join(", ")}`);
      if (rattaches.has(id)) {
        const vueFamilleApres = await parent!.appel("GET", `/apprenants/${id}/frais`);
        verifier("Aucun montant dans la situation relue par le parent", vueFamilleApres.statut === 200 && clefsMontant(vueFamilleApres.json).length + deviseDansLeTexte(vueFamilleApres.json) === 0, true, clefsMontant(vueFamilleApres.json).join(", "));
        verifier("La famille et l'école lisent le même statut des mêmes faits", String(situation(vueFamilleApres.json)?.statut) === String(situation(finale.json)?.statut), true, `famille ${String(situation(vueFamilleApres.json)?.statut)} · école ${String(situation(finale.json)?.statut)}`);
      } else {
        verifier("Comparaison famille/école non jouée : l'élève saisi n'est rattaché à aucun compte parent testé", rattaches.has(id), false);
      }

      // 7) Le rapprochement de l'école, et la recherche faite en base : filtrer après coup ne retrouverait
      //    personne dans une école de plus de 300 élèves.
      const apres = await directrice!.appel("GET", `/etablissements/${PILOTE}/frais?anneeScolaire=${encodeURIComponent(annee)}`);
      const parTerme = liste(apres.json?.parTerme);
      verifier("Rapprochement terme par terme sur les seuls termes appelés", parTerme.length === 2, true, parTerme.map((t) => `${String(t.terme)} ${String(t.couvertes)}/${String(t.attendues)}`).join(" · "));
      const t1 = parTerme.find((t) => t.terme === "T1");
      // « L'effectif reste la liste scolarisée du jour » se prouve par l'égalité, pas par `>= 1` : le compte de
      // l'état doit être exactement le nombre de lignes d'élèves présents, triés ou non.
      const surLaListe = liste(apres.json?.lignes).filter((l) => !l.horsEffectif).length;
      verifier("Des pièces sont comptées, l'effectif reste la liste scolarisée du jour", Number(t1?.couvertes ?? 0) >= 1 && Number(apres.json?.effectif ?? 0) > 0 && !apres.json?.tronque && Number(apres.json?.effectif) === surLaListe, true, `effectif ${String(apres.json?.effectif)} = ${surLaListe} ligne(s) du jour · ${String(apres.json?.horsEffectif)} sorti(s) avec une pièce`);
      verifier("Aucun montant dans l'état de l'école après écritures", apres.statut === 200 && clefsMontant(apres.json).length + deviseDansLeTexte(apres.json) === 0, true, `${liste(apres.json?.lignes).length} ligne(s) servie(s)`);
      const premierNom = String(cible.nom ?? "").split(" ")[0]!.toLocaleLowerCase("fr");
      verifier("L'élève saisi porte un nom exploitable par la recherche", premierNom !== "", true, `${id} · ${premierNom.length} lettre(s)`);
      const recherche = await directrice!.appel("GET", `/etablissements/${PILOTE}/frais?anneeScolaire=${encodeURIComponent(annee)}&recherche=${encodeURIComponent(premierNom)}`);
      const trouvees = liste(recherche.json?.lignes);
      verifier("Recherche nominative côté serveur : l'élève saisi revient, et aucune autre ligne que les siennes", recherche.statut === 200 && recherche.json?.recherche === premierNom && trouvees.length >= 1 && trouvees.every((l) => String(l.nom).toLocaleLowerCase("fr").includes(premierNom)) && trouvees.some((l) => String(l.apprenantId) === id), true, `${trouvees.length} ligne(s) sur ${String(apres.json?.effectif)}, filtre ${String(recherche.json?.recherche)}`);

      // 8) Le flux que lit la tutelle : un décompte « QUITTANCE_FRAIS · CEG X · 10 h 12 » serait déjà un état de
      //    rapprochement nominatif, ou presque. Les faits de frais en sortent pour tout le monde.
      const flux = await central!.appel("GET", "/pilotage/flux?limite=30");
      const typesFlux = [...liste(flux.json?.parType).map((t) => String(t.type)), ...liste(flux.json?.derniers).map((e) => String(e.type))];
      verifier("Flux du pilotage servi et peuplé, aucun fait de frais ni compté ni listé", flux.statut === 200 && typesFlux.length > 0 && typesFlux.every((t) => !FAITS_FRAIS.has(t)), true, `${typesFlux.length} type(s) vus`);
      const dossierApres = await directrice!.appel("GET", "/apprenants/APP-000001?finalite=gestion");
      const parcoursApres = liste(dossierApres.json?.parcours);
      verifier("Et le dossier général d'un élève peuplé n'en montre toujours pas", dossierApres.statut === 200 && parcoursApres.length > 0 && parcoursApres.every((e) => !FAITS_FRAIS.has(String(e.type))), true, `${parcoursApres.length} fait(s) au parcours`);
    }
  }

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
    anneeScolaire: "2026-2027",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: ["Professeur principal", "Chef d'établissement"], referencePv: "PV-REC-01" },
    decisions: [{ apprenantId: "APP-000001", decision: "admis" }],
  });
  verifier("Directrice : conseil de passage (admis réinscrit)", [201, 422].includes(passage.statut), true, `statut ${passage.statut}${passage.statut === 422 ? " — apprenant déjà muté d'une exécution précédente" : ""}`);
  verifier("Directrice : la séance du conseil est au registre avec ses membres", passage.statut !== 201 || passage.json?.nombreDeMembres === 2, true, `membres ${passage.json?.nombreDeMembres}`);
  verifier("Directrice : un conseil vers une autre année que la suivante est refusé (pas de réouverture détournée)", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2024-2025",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: ["Chef d'établissement"], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  verifier("Directrice : une séance future est refusée", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2026-2027",
    seance: { dateSeance: "2099-01-01", membres: ["Chef d'établissement"], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  verifier("Directrice : une séance sans membre est refusée", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2026-2027",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: [], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  verifier("Directrice : un nom de personne au lieu d'une qualité est refusé (registre ineffaçable)", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2026-2027",
    seance: { dateSeance: new Date().toISOString().slice(0, 10), membres: ["Mme Adjoua KOSSOU, parent délégué"], referencePv: null },
    decisions: [{ apprenantId: "APP-000001", decision: "redouble" }],
  })).statut, 422);
  verifier("Directrice : une date de séance impossible est refusée", (await directrice!.appel("POST", `/etablissements/${PILOTE}/classes/CLS-PAR-5eA-S/conseil-passage`, {
    anneeScolaire: "2026-2027",
    seance: { dateSeance: "2026-02-31", membres: ["Chef d'établissement"], referencePv: null },
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
  {
    const offres = await etudiantIfri!.appel("GET", "/moi/contrat/offres");
    verifier("Étudiant·e : offres d'UE ouvertes à son contrat (sa filière, son année)", offres.statut === 200 && !!offres.json?.inscription && Array.isArray(offres.json?.offres), true, `HTTP ${offres.statut}`);
    verifier("Étudiant·e : ses stages", (await etudiantIfri!.appel("GET", "/moi/stages")).statut, 200);
    verifier("Élève du secondaire : pas d'offre d'UE (aucune inscription dans le supérieur)", (await apprenante!.appel("GET", "/moi/contrat/offres")).json?.inscription == null, true);
    verifier("Élève : ses vœux d'orientation", (await apprenante!.appel("GET", "/moi/voeux")).statut, 200);
  }
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

titre("Boucle d'action : une alerte se prend en charge, se suit, se clôt");
{
  const al = await departement!.appel("GET", "/pilotage/alertes");
  const rapport = await departement!.appel("GET", "/rapports/mensuel");
  verifier("Direction départementale : rapport mensuel tiré du registre", rapport.statut === 200 && rapport.json?.source === "registre", true, `HTTP ${rapport.statut}`);
  verifier("Hors tutelle : rapport mensuel refusé", (await enseignant!.appel("GET", "/rapports/mensuel")).statut, 403);
  verifier("Rapport d'un mois à venir : 422", (await departement!.appel("GET", "/rapports/mensuel?mois=2099-01")).statut, 422);
  verifier("Chef : responsables sans NPI de son établissement", (await directrice!.appel("GET", `/etablissements/${PILOTE}/familles/responsables-provisoires`)).statut, 200);
  verifier("Enseignant : attester un responsable sans NPI refusé", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/familles/responsable-provisoire`, { apprenantId: "APP-000001", nomAffiche: "Recette Refus", telephone: "+22901970000", nature: "parent", pieceVue: "Recette : pièce" })).statut, 403);
  verifier("Rattachement d'un NPI inconnu du registre : refusé", (await directrice!.appel("POST", `/etablissements/${PILOTE}/familles/PRV-AAAAAAAAAA/rattacher-npi`, { npi: "0000000000" })).statut >= 400, true);
  const importListe = (lignes: unknown[]) => ({ mode: "simulation", anneeScolaire: "2025-2026", idImport: `RECETTE-IMP-${Date.now()}`, lignes });
  const ligneFantome = { n: 2, classe: "Classe inexistante", npi: "0000000000", nom: "INCONNU", prenoms: "Recette" };
  const simImport = await directrice!.appel("POST", `/etablissements/${PILOTE}/import/eleves`, importListe([ligneFantome]));
  verifier("Import de liste : la vérification n'écrit rien et rend un verdict par ligne", simImport.statut === 200 && simImport.json.ecrit === false && (simImport.json.lignes as unknown[] | undefined)?.length === 1, true, `HTTP ${simImport.statut}`);
  verifier("Import de liste : enseignant refusé", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/import/eleves`, importListe([ligneFantome]))).statut, 403);
  verifier("Import de liste : champ hors contrat refusé", (await directrice!.appel("POST", `/etablissements/${PILOTE}/import/eleves`, importListe([{ ...ligneFantome, role: "admin" }]))).statut, 422);
  const importServices = (lignes: unknown[]) => ({ mode: "simulation", anneeScolaire: "2025-2026", idImport: `RECETTE-SRV-${Date.now()}`, lignes });
  const ligneService = { n: 2, classe: "5e A", matiere: "Maths", enseignant: "Enseignant Inexistant" };
  const simServices = await directrice!.appel("POST", `/etablissements/${PILOTE}/import/services`, importServices([ligneService]));
  verifier("Import des services : vérification sans écriture, enseignant hors personnel refusé", simServices.statut === 200 && simServices.json.ecrit === false && (simServices.json.lignes as { statut: string }[] | undefined)?.[0]?.statut === "erreur", true, `HTTP ${simServices.statut}`);
  verifier("Import des services : un enseignant ne s'attribue pas de classe", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/import/services`, importServices([ligneService]))).statut, 403);
  verifier("Import des services : identifiant interne d'enseignant hors contrat", (await directrice!.appel("POST", `/etablissements/${PILOTE}/import/services`, importServices([{ ...ligneService, enseignantId: "ENS-00001" }]))).statut, 422);
  const edt = (lignes: unknown[]) => ({ mode: "simulation", anneeScolaire: "2025-2026", idImport: `RECETTE-EDT-${Date.now()}`, lignes });
  const seance = { n: 2, classe: "5e A", jour: "lundi", debut: "07:00", fin: "08:00", matiere: "Maths", enseignant: "Enseignant Inexistant" };
  const simEdt = await directrice!.appel("POST", `/etablissements/${PILOTE}/import/emploi-du-temps`, edt([seance]));
  verifier("Emploi du temps : vérification sans écriture, enseignant hors personnel refusé", simEdt.statut === 200 && simEdt.json.ecrit === false && (simEdt.json.lignes as { statut: string }[] | undefined)?.[0]?.statut === "erreur", true, `HTTP ${simEdt.statut}`);
  verifier("Emploi du temps : un enseignant ne dépose pas l'emploi du temps", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/import/emploi-du-temps`, edt([seance]))).statut, 403);
  verifier("Emploi du temps : champ hors contrat refusé", (await directrice!.appel("POST", `/etablissements/${PILOTE}/import/emploi-du-temps`, edt([{ ...seance, enseignantId: "ENS-00001" }]))).statut, 422);
  verifier("Emploi du temps : l'enseignant lit le sien", (await enseignant!.appel("GET", "/moi/emploi-du-temps")).statut, 200);
  const seanceEcran = { classeId: "CLS-PAR-5eA-S", jour: 6, debut: "07:00", fin: "08:00", matiere: "SVT", enseignantId: "ENS-INEXISTANT" };
  verifier("Séance à l'écran : un enseignant ne modifie pas l'emploi du temps", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/emploi-du-temps/seances`, seanceEcran)).statut, 403);
  verifier("Séance à l'écran : enseignant hors personnel refusé", (await directrice!.appel("POST", `/etablissements/${PILOTE}/emploi-du-temps/seances`, seanceEcran)).statut, 422);
  verifier("Séance à l'écran : séance inconnue introuvable", (await directrice!.appel("POST", `/etablissements/${PILOTE}/emploi-du-temps/seances/CRS-inexistante/supprimer`, {})).statut, 404);
  const anneesEtab = await directrice!.appel("GET", `/etablissements/${PILOTE}/annees`);
  verifier("Années scolaires : l'année des élèves de démonstration reste ouverte (école pas encore basculée)", anneesEtab.statut === 200 && (anneesEtab.json.annees as { anneeScolaire: string; ouverte: boolean }[]).find((a) => a.anneeScolaire === "2025-2026")?.ouverte === true, true, `HTTP ${anneesEtab.statut}`);
  verifier("Années scolaires : un chef ne rouvre pas une année", (await directrice!.appel("POST", `/etablissements/${PILOTE}/annees/2025-2026/reouverture`, { motif: "Recette : tentative de réouverture", jours: 3 })).statut, 403);
  verifier("Années scolaires : suivi départemental refusé au chef", (await directrice!.appel("GET", "/annees-scolaires/a-suivre")).statut, 403);
  verifier("Années scolaires : suivi par la direction départementale", (await departement!.appel("GET", "/annees-scolaires/a-suivre")).statut, 200);
  verifier("Emploi du temps de l'établissement : refusé à l'enseignant", (await enseignant!.appel("GET", `/etablissements/${PILOTE}/emploi-du-temps`)).statut, 403);
  verifier("Inspection : écoles non connectées de sa circonscription", (await inspecteur!.appel("GET", "/inspection/ecoles-non-connectees")).statut, 200);
  verifier("Hors inspection : écoles non connectées refusées", (await departement!.appel("GET", "/inspection/ecoles-non-connectees")).statut, 403);
  verifier("École connectée : la saisie pour son compte est refusée (409), elle lui revient", (await inspecteur!.appel("POST", `/inspection/etablissements/${PILOTE}/absences`, { classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, apprenantIds: ["APP-000001"], piece: "Recette : feuille d'appel" })).statut, 409);
  verifier("Enseignant : saisie pour le compte d'une école refusée", (await enseignant!.appel("POST", `/inspection/etablissements/${PILOTE}/absences`, { classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, apprenantIds: ["APP-000001"], piece: "Recette : feuille d'appel" })).statut, 403);
  verifier("Direction départementale : statuts d'emploi des enseignants du territoire", (await departement!.appel("GET", "/tutelle/personnels")).statut, 200);
  verifier("Hors tutelle : statuts des personnels refusés", (await enseignant!.appel("GET", "/tutelle/personnels")).statut, 403);
  verifier("Inspection : lecture seule, l'écriture d'un statut est refusée", (await inspecteur!.appel("POST", "/enseignants/ENS-00001/statut", { statut: "ape", motif: "Recette : inspection sans droit" })).statut, 403);
  verifier("Chef d'établissement : ne déclare pas le statut de son personnel", (await directrice!.appel("POST", "/enseignants/ENS-00001/statut", { statut: "ape", motif: "Recette : auto-déclaration" })).statut, 403);
  verifier("Statut hors liste : 422", (await departement!.appel("POST", "/enseignants/ENS-00001/statut", { statut: "titulaire", motif: "Recette : valeur inventée" })).statut, 422);
  verifier("Inspection : visites annoncées (rappels du poste de pilotage)", (await inspecteur!.appel("GET", "/visites/a-venir")).statut, 200);
  verifier("Hors tutelle : visites annoncées refusées", (await enseignant!.appel("GET", "/visites/a-venir")).statut, 403);
  verifier("Alertes : état de suivi et droit de suivre renvoyés", al.statut === 200 && al.json?.peutSuivre === true && typeof al.json?.suivis === "object", true, `HTTP ${al.statut}`);
  verifier("Hors tutelle : prise en charge refusée", (await enseignant!.appel("POST", "/pilotage/alertes/suivi", { alerteId: "taux_abandon|parakou|ecart", note: "Hors tutelle", echeanceJours: 30 })).statut, 403);
  verifier("Alerte inventée : 404", (await departement!.appel("POST", "/pilotage/alertes/suivi", { alerteId: "taux_abandon|commune-imaginaire|ecart", note: "Alerte qui n'existe pas", echeanceJours: 30 })).statut, 404);
  const libre = liste(al.json?.alertes).find((a) => !(al.json?.suivis as Record<string, unknown>)[String(a.id)]);
  if (ECRITURES && libre) {
    const p = await departement!.appel("POST", "/pilotage/alertes/suivi", { alerteId: libre.id, note: "Recette : visite des écoles de la commune.", echeanceJours: 30 });
    verifier("Direction départementale : prise en charge d'une alerte", p.statut, 201);
    verifier("Une seule prise en charge ouverte par alerte", (await departement!.appel("POST", "/pilotage/alertes/suivi", { alerteId: libre.id, note: "Doublon refusé", echeanceJours: 30 })).statut, 409);
    verifier("Clôture motivée du suivi", (await departement!.appel("POST", `/pilotage/alertes/suivi/${p.json.demandeId}/cloture`, { issue: "traitee", constat: "Recette : écoles visitées, remédiation engagée." })).statut, 200);
    verifier("Un suivi clos ne se rouvre pas par une seconde clôture", (await departement!.appel("POST", `/pilotage/alertes/suivi/${p.json.demandeId}/cloture`, { issue: "traitee", constat: "Seconde clôture refusée" })).statut, 409);
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
    // Un PV rejeté (session inconnue) n'est pas « reçu » : renvoyé sous le même lot, il est retraité, pas pris pour un rejeu.
    const lotPv = `REC-PV-${Date.now()}`;
    const pv = { examen: "BEPC", session: "Session-inexistante", pvReference: "PV-RECETTE", decisions: [{ numeroTable: "T-0001", decision: "admis", moyenne: 12 }] };
    verifier("eRESULTATS → PV sur une session inconnue : 404", (await envoyer("eresultats", "/interop/eresultats/pv-examen", pv, { lot: lotPv })).statut, 404);
    verifier("Le même lot renvoyé après rejet : retraité (404), pas un faux rejeu (409)", (await envoyer("eresultats", "/interop/eresultats/pv-examen", pv, { lot: lotPv })).statut, 404);
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

titre("Balayage en lecture : chaque route GET exercée par son profil, refus de contrôle");
{
  // Toute route de lecture livrée est appelée au moins une fois par le profil qui la sert (200), et les plus
  // sensibles par un profil qui n'y a pas droit (403). Une lecture jamais appelée n'est pas une lecture testée.
  const [dirIfri, etudiantIfri, enseignanteSup] = await Promise.all(["prosper.ahouandjinou", "etudiant.ifri", "sena.hounkpatin"].map(async (id) => {
    const s = new Session(); await s.connexion(id); return s;
  }));
  const lit = async (nom: string, s: Session, chemin: string, attendu = 200) => verifier(nom, (await s.appel("GET", chemin)).statut, attendu);
  const IFRI = "ETB-SUP-UAC-IFRI";
  const ETU = "APP-900001";

  // Public et session
  await lit("Référentiel : départements (public)", anonyme, "/referentiels/departements");
  await lit("Référentiel : communes (public)", anonyme, "/referentiels/communes");
  const codes = liste((await anonyme.appel("GET", "/dictionnaire")).json).map((d) => String(d.code));
  await lit("Dictionnaire : une fiche (public)", anonyme, `/dictionnaire/${codes[0]}`);
  await lit("Dictionnaire : fiche inconnue → 404", anonyme, "/dictionnaire/indicateur_inexistant", 404);
  await lit("Dictionnaire : impact d'une version publiée (réussite aux examens)", central!, "/dictionnaire/taux_reussite_examen/impact?examen=BEPC");
  await lit("Dictionnaire : aucune comparaison publiée pour un autre indicateur → 404", central!, `/dictionnaire/${codes.find((x) => x !== "taux_reussite_examen")}/impact`, 404);
  await lit("Dictionnaire : impact sans session → 401", anonyme, "/dictionnaire/taux_reussite_examen/impact?examen=BEPC", 401);
  await lit("Ma session : profil courant", enseignant!, "/moi");
  await lit("État d'authentification", enseignant!, "/auth/etat");
  await lit("Priorités nationales", central!, "/priorites");

  // Établissement (chef) et classe (enseignant)
  for (const [nom, chemin] of [["absences", "absences"], ["enseignants", "enseignants"], ["justificatifs", "justificatifs"], ["personnel", "personnel"], ["demandes", "demandes"]] as const) {
    await lit(`Directrice → ${nom} de l'établissement`, directrice!, `/etablissements/${PILOTE}/${chemin}`);
  }
  await lit("Enseignant → personnel de l'établissement refusé", enseignant!, `/etablissements/${PILOTE}/personnel`, 403);
  await lit("Directrice → dossier de gestion d'un apprenant", directrice!, "/apprenants/APP-000001/dossier-gestion");
  await lit("Parent → dossier de gestion refusé", parent!, "/apprenants/APP-000001/dossier-gestion", 403);
  await lit("Directrice → classes d'accueil d'un apprenant", directrice!, "/apprenants/APP-000001/classes-accueil");
  await lit("Enseignant → historique de sa classe", enseignant!, "/classes/CLS-PAR-5eA-S/historique");
  const aTraiter = await directrice!.appel("GET", "/demandes/a-traiter");
  verifier("Directrice → demandes à traiter", aTraiter.statut, 200);
  const premiereDemande = liste(aTraiter.json)[0]?.id as string | undefined;
  if (premiereDemande) await lit("Directrice → détail d'une demande", directrice!, `/demandes/${premiereDemande}`);
  await lit("Parent → ses demandes d'exercice des droits", parent!, "/droits/mes-demandes");

  // Pilotage et tutelle
  await lit("Direction départementale → alertes", departement!, "/pilotage/alertes");
  await lit("Direction départementale → priorités du territoire", departement!, "/pilotage/priorites");
  await lit("Direction départementale → flux du jour", departement!, "/pilotage/flux");
  await lit("Direction départementale → compléments de la console", departement!, "/pilotage/territoire/complements");
  await lit("Direction départementale → absences du territoire", departement!, "/pilotage/territoire/absences");
  await lit("Enseignant → flux du pilotage refusé", enseignant!, "/pilotage/flux", 403);
  await lit("Direction départementale → transmissions d'une commune", departement!, "/plateforme/qualite/communes/parakou");
  await lit("Direction départementale → relances suivies", departement!, "/plateforme/relances");
  await lit("Administration centrale → journal d'interopérabilité", central!, "/plateforme/interoperabilite");
  await lit("Enseignant → journal d'interopérabilité refusé", enseignant!, "/plateforme/interoperabilite", 403);

  // Gouvernance (DPO) et administration
  await lit("DPO → journal d'audit", dpo!, "/audit/journal");
  await lit("DPO → statistiques d'audit", dpo!, "/audit/statistiques");
  await lit("Enseignant → journal d'audit refusé", enseignant!, "/audit/journal", 403);
  await lit("Autorité → délégations à valider", admin!, "/delegation/a-valider");
  await lit("Administrateur → calendrier", admin!, "/admin/calendrier");
  await lit("Administrateur → référentiel des départements", admin!, "/admin/referentiels/departements");
  await lit("Administrateur → référentiel des circonscriptions", admin!, "/admin/referentiels/circonscriptions");
  await lit("Administrateur → recherche d'établissement", admin!, "/admin/referentiels/etablissements?q=CEG");
  await lit("Administrateur → identifiant proposé", admin!, "/admin/identifiant?nom=Recette%20Balayage");
  const npiInconnu = await admin!.appel("GET", "/admin/referentiels/npi/0000000009");
  verifier("Administrateur → recherche d'un NPI inconnu : réponse vide, rien d'inventé", npiInconnu.statut === 200 && npiInconnu.json?.personne == null && npiInconnu.json?.apprenant == null, true, `HTTP ${npiInconnu.statut}`);
  await lit("Administrateur → tickets d'assistance", admin!, "/assistance/tickets");
  const comptes = liste((await admin!.appel("GET", "/admin/comptes")).json);
  if (comptes[0]?.id) await lit("Administrateur → fiche d'un compte", admin!, `/admin/comptes/${comptes[0].id as string}`);
  await lit("Administrateur → fiche d'un compte à identifiant composé (CPT-directeur-ifri)", admin!, "/admin/comptes/CPT-directeur-ifri");
  await lit("Administrateur → identifiant de compte mal formé → 422", admin!, "/admin/comptes/CPT-Robert'--", 422);
  await lit("Enseignant → administration des comptes refusée", enseignant!, "/admin/calendrier", 403);

  // Enseignement supérieur : bureau national, établissement, étudiant, enseignant
  for (const chemin of ["concours", "echeances", "etablissements", "actes/delais", "allocations/effectifs", "stages/effectifs", "scolarite/effectifs", "scolarite/credits-ects"]) {
    await lit(`Bureau du supérieur → ${chemin}`, central!, `/enseignement-superieur/${chemin}`);
  }
  for (const chemin of ["filieres", "periodes", "offres", "unites-enseignement", "groupes", "regles-validation", "equivalences", "statut-administratif", "scolarite/credits-ects", "stages", "actes", "actes/delais", `contrat/${ETU}`]) {
    await lit(`Direction IFRI → ${chemin}`, dirIfri!, `/etablissements/${IFRI}/${chemin}`);
  }
  const periodeIfri = liste((await dirIfri!.appel("GET", `/etablissements/${IFRI}/periodes`)).json)[0]?.id as string | undefined;
  if (periodeIfri) await lit("Direction IFRI → validations préparables d'une période", dirIfri!, `/etablissements/${IFRI}/validations/preparables?periodeId=${periodeIfri}`);
  await lit("Direction IFRI → validations préparables sans période → 422", dirIfri!, `/etablissements/${IFRI}/validations/preparables`, 422);
  await lit("Étudiant·e → filières de gestion de l'établissement refusées", etudiantIfri!, `/etablissements/${IFRI}/offres`, 403);
  await lit("Étudiant·e → son attestation de scolarité", etudiantIfri!, "/moi/attestation-scolarite");
  await lit("Étudiant·e → ses allocations", etudiantIfri!, "/moi/allocations");
  await lit("Étudiant·e → son dossier d'allocation", etudiantIfri!, "/moi/dossier-allocation");
  await lit("Enseignante du supérieur → ses offres d'UE", enseignanteSup!, "/moi/enseignements/offres");
  await lit("Enseignante du supérieur → stages qu'elle encadre", enseignanteSup!, "/moi/stages/encadres");
}

titre("Fin de session");
verifier("Déconnexion", (await enseignant!.appel("POST", "/auth/deconnexion")).statut, 200);
verifier("Session révoquée côté serveur", (await enseignant!.appel("GET", "/auth/session")).statut, 401);

console.log(`\n${cas - echecs}/${cas} cas conformes${ECRITURES ? " (avec écritures)" : " (lecture et refus uniquement)"}.`);
process.exit(echecs ? 1 : 0);
