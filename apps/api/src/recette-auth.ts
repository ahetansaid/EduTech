import { Session } from "./client-recette";

/** Recette de l'authentification réelle : sessions, CSRF, origine, déconnexion. */
let echecs = 0;
const verifier = (libelle: string, obtenu: number | boolean, attendu: number | boolean) => {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? "✔" : "✘"} ${libelle} — ${obtenu}${ok ? "" : ` (attendu ${attendu})`}`);
};

const anonyme = new Session();
verifier("Session sans cookie", (await anonyme.appel("GET", "/auth/session")).statut, 401);
verifier("Mauvais mot de passe", (await new Session().connexion("idrissou.sanni", "Faux-Mot-De-Passe-1")).statut, 401);
verifier("Compte inexistant", (await new Session().connexion("personne.inconnue", "Quelconque-123")).statut, 401);

const ens = new Session();
verifier("Connexion enseignant", (await ens.connexion("idrissou.sanni")).statut, 200);
verifier("Cookie de session posé", ens.aSession, true);
const s = await ens.appel("GET", "/auth/session");
verifier("Session active", s.statut, 200);
const absence = { classeId: "CLS-PAR-5eA-S", date: new Date().toISOString().slice(0, 10), apprenantIds: ["APP-000001"] };
verifier("Écriture sans jeton CSRF", (await ens.appel("POST", "/evenements/absences", absence, { "x-csrf-token": "" })).statut, 403);
verifier("Écriture depuis une origine étrangère", (await ens.appel("POST", "/evenements/absences", absence, { origin: "https://pirate.example" })).statut, 403);
verifier("Écriture légitime (CSRF + même origine)", (await ens.appel("POST", "/evenements/absences", absence)).statut, 201);
verifier("Déconnexion", (await ens.appel("POST", "/auth/deconnexion")).statut, 200);
verifier("Session après déconnexion", (await ens.appel("GET", "/auth/session")).statut, 401);

console.log(echecs ? `\n${echecs} échec(s)` : "\nAuthentification conforme.");
process.exit(echecs ? 1 : 0);
