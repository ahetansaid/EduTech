import { COMPTES, codeFrais, Session, TOTP } from "./client-recette";

/**
 * Contrôle en production des lots A à E, SANS écriture de données : connexions, second facteur,
 * élévation, refus attendus, vigie. BEILE_API désigne l'API visée.
 */
let echecs = 0;
const ok = (l: string, c: boolean, d = "") => { console.log(`${c ? "✔" : "✘"} ${l}${d ? ` — ${d}` : ""}`); if (!c) echecs++; };

const sessions: Record<string, Session> = {};
for (const id of Object.keys(COMPTES)) {
  const s = new Session();
  const r = await s.connexion(id);
  sessions[id] = s;
  const etat = await s.appel("GET", "/auth/etat");
  const compte = (etat.json.session as { compte?: { mfaExige?: boolean; mfaVerifie?: boolean } } | null)?.compte;
  ok(`Connexion ${id}${TOTP[id] ? " (avec second facteur)" : ""}`, r.statut === 200 && (!compte?.mfaExige || !!compte.mfaVerifie), `${r.statut}`);
}

const brute = new Session();
const r = await brute.appel("POST", "/auth/connexion", { identifiant: "admin.beile", motDePasse: COMPTES["admin.beile"] });
ok("Autorité : second facteur demandé après le mot de passe", r.json.etape === "mfa_a_verifier", String(r.json.etape));
ok("Sans second facteur : données refusées", (await brute.appel("GET", "/delegation/moi")).json.code === "mfa_a_verifier");
ok("Code faux refusé", (await brute.appel("POST", "/auth/mfa/verifier", { code: "000000" })).statut === 422);
ok("Code juste accepté", (await brute.appel("POST", "/auth/mfa/verifier", { code: await codeFrais("admin.beile") })).statut === 200);

const dir = sessions["hortense.guera"]!;
const sansElev = await dir.appel("POST", "/delegation/comptes", { nomAffiche: "Sans Elevation", fonction: "Test", role: "enseignant", organisationId: "ORG-ETB-ETB-PAR-PILOTE-CEG" });
ok("Écriture d'administration sans élévation : refusée", sansElev.json.code === "elevation_requise", String(sansElev.json.code));
ok("Élévation de la directrice (mot de passe)", (await dir.elever()).statut === 200);
ok("Élévation mot de passe faux refusée", (await sessions["idrissou.sanni"]!.appel("POST", "/auth/elevation", { motDePasse: "Faux-Mot-De-Passe-1" })).statut === 422);
ok("Élévation de l'autorité (second facteur)", (await sessions["admin.beile"]!.elever()).statut === 200);

ok("Enseignant : second facteur non exigé", (await sessions["idrissou.sanni"]!.appel("GET", "/auth/mfa/etat")).json.exige === false);
ok("Enseignant → alertes de sécurité : 403", (await sessions["idrissou.sanni"]!.appel("GET", "/securite/alertes")).statut === 403);
ok("DPO → alertes de sécurité", (await sessions["laure.zannou"]!.appel("GET", "/securite/alertes")).statut === 200);
const canaux = await new Session().appel("GET", "/auth/canaux");
ok("Canaux d'envoi annoncés fermés (aucun fournisseur configuré)", canaux.json.sms === false && canaux.json.courriel === false);
const gen = await new Session().appel("POST", "/auth/code/demande", { identifiant: "idrissou.sanni", objet: "recuperation" });
ok("Demande de code sans canal : refus explicite", gen.statut === 503 && gen.json.code === "canaux_fermes", String(gen.statut));
ok("Délégation de la directrice toujours en place", (await dir.appel("GET", "/delegation/moi")).json.delegations instanceof Array);
ok("Témoin : route inexistante → 404", (await new Session().appel("GET", "/inexistant-xyz")).statut === 404);

console.log(echecs ? `\n${echecs} échec(s)` : "\nProduction conforme");
process.exit(echecs ? 1 : 0);
