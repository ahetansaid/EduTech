import { COMPTES, Session } from "./client-recette";

/**
 * Test de charge par utilisateurs virtuels : chaque utilisateur a SA session (vraie connexion), sa propre
 * adresse simulée, et rejoue le parcours de son rôle avec un temps de réflexion. Mesure débit, latences
 * p50/p95/p99 et erreurs. Ne fait que des lectures (sauf --appel : saisies d'absences, base jetable seulement).
 *
 * Usage : BEILE_API=… npx tsx src/charge.ts [--utilisateurs 200] [--duree 30] [--reflexion 1000] [--appel]
 */
const arg = (n: string, d: number) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const UTILISATEURS = arg("utilisateurs", 200), DUREE_S = arg("duree", 30), REFLEXION_MS = arg("reflexion", 1000);
const APPEL = process.argv.includes("--appel");
const PILOTE = "ETB-PAR-PILOTE-CEG";

const PARCOURS: Record<string, string[]> = {
  "hortense.guera": [`/etablissements/${PILOTE}/tableau`, `/etablissements/${PILOTE}/eleves`, `/etablissements/${PILOTE}/examens`],
  "idrissou.sanni": ["/moi/classes", "/classes/CLS-PAR-5eA-S", "/moi/notifications"],
  "chantal.dossou": ["/famille/enfants", "/moi/notifications"],
  "aicha.zannou": ["/moi/passeport", "/moi/notifications"],
  "bertrand.chabi": ["/pilotage/synthese", "/pilotage/territoire", "/plateforme/qualite"],
  "felicite.akakpo": ["/pilotage/synthese", "/pilotage/carte?couche=maths", "/priorites"],
  "nestor.orou": ["/pilotage/territoire", `/etablissements/${PILOTE}/tableau`],
};
const filtre = process.argv.includes("--roles") ? process.argv[process.argv.indexOf("--roles") + 1]!.split(",") : null;
const roles = Object.keys(PARCOURS).filter((r) => COMPTES[r] && (!filtre || filtre.includes(r)));

const latences: number[] = [];
const statuts = new Map<number, number>();
let enCours = true;

/** Phase 1 : connexion (scrypt, volontairement coûteux) — mesurée à part, comme un pic d'arrivée du matin. */
async function connecter(i: number) {
  const identifiant = roles[i % roles.length]!;
  const ip = `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;
  const s = new Session(identifiant);
  const r = await s.appel("POST", "/auth/connexion", { identifiant, motDePasse: COMPTES[identifiant] }, { "x-forwarded-for": ip }).catch(() => null);
  return r?.statut === 200 ? { s, identifiant, ip } : null;
}

/** Phase 2 : régime établi — chaque utilisateur rejoue le parcours de son rôle, avec un temps de réflexion. */
async function naviguer(u: { s: Session; identifiant: string; ip: string }) {
  await new Promise((ok) => setTimeout(ok, Math.random() * REFLEXION_MS));
  let k = 0;
  while (enCours) {
    const parcours = PARCOURS[u.identifiant]!;
    const chemin = parcours[k++ % parcours.length]!;
    const t0 = performance.now();
    const x = APPEL && u.identifiant === "idrissou.sanni" && k % 3 === 0
      ? await u.s.appel("POST", "/evenements/absences", { classeId: "CLS-PAR-5eA-S", date: new Date().toISOString().slice(0, 10), apprenantIds: ["APP-000001"] }, { "x-forwarded-for": u.ip })
      : await u.s.appel("GET", chemin, undefined, { "x-forwarded-for": u.ip });
    if (!enCours) break;
    latences.push(performance.now() - t0);
    statuts.set(x.statut, (statuts.get(x.statut) ?? 0) + 1);
    await new Promise((ok) => setTimeout(ok, REFLEXION_MS * (0.5 + Math.random())));
  }
}

console.log(`${UTILISATEURS} utilisateurs virtuels · ${DUREE_S} s · réflexion ~${REFLEXION_MS} ms · ${roles.length} rôles`);
const t0 = performance.now();
const connectes = (await Promise.all(Array.from({ length: UTILISATEURS }, (_, i) => connecter(i)))).filter((u): u is NonNullable<typeof u> => !!u);
console.log(`connexions : ${connectes.length}/${UTILISATEURS} en ${Math.round(performance.now() - t0)} ms (scrypt, pic d'arrivée simultanée)`);
const taches = connectes.map(naviguer);
await new Promise((ok) => setTimeout(ok, DUREE_S * 1000));
enCours = false;
await Promise.all(taches);
const duree = DUREE_S;
latences.sort((a, b) => a - b);
const q = (p: number) => Math.round(latences[Math.min(latences.length - 1, Math.floor(p * latences.length))] ?? 0);
const erreurs = [...statuts].filter(([s]) => s < 200 || s >= 400).reduce((n, [, v]) => n + v, 0) + (UTILISATEURS - connectes.length);
console.log(`requêtes : ${latences.length} · débit : ${(latences.length / duree).toFixed(1)} req/s`);
console.log(`latence  : p50 ${q(0.5)} ms · p95 ${q(0.95)} ms · p99 ${q(0.99)} ms · max ${q(1)} ms`);
console.log(`statuts  : ${[...statuts].map(([s, n]) => `${s}×${n}`).join(" · ")}${connectes.length < UTILISATEURS ? ` · connexions échouées ×${UTILISATEURS - connectes.length}` : ""}`);
console.log(erreurs ? `✘ ${erreurs} erreur(s)` : "✔ aucune erreur");
process.exit(erreurs ? 1 : 0);
