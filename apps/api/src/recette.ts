import { Session } from "./client-recette";

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
verifier("Inspecteur → délibération (écriture interdite)", (await inspecteur!.appel("POST", `/etablissements/${PILOTE}/examens/deliberation`, {})).statut, 403);
verifier("Enseignant → délibération", (await enseignant!.appel("POST", `/etablissements/${PILOTE}/examens/deliberation`, {})).statut, 403);
verifier("Directrice → examens", (await directrice!.appel("GET", `/etablissements/${PILOTE}/examens`)).statut, 200);
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
}

titre("Fin de session");
verifier("Déconnexion", (await enseignant!.appel("POST", "/auth/deconnexion")).statut, 200);
verifier("Session révoquée côté serveur", (await enseignant!.appel("GET", "/auth/session")).statut, 401);

console.log(`\n${cas - echecs}/${cas} cas conformes${ECRITURES ? " (avec écritures)" : " (lecture et refus uniquement)"}.`);
process.exit(echecs ? 1 : 0);
