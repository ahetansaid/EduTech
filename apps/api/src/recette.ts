/**
 * Recette de l'API sur la base réelle : chaque cas vérifie un statut attendu, y compris les refus.
 * Usage : API démarrée (npm run dev:api), puis `npm run recette -w @beile/api`.
 */
const BASE = process.env.BEILE_API ?? "http://localhost:4000/api/v1";
const AUJOURDHUI = new Date().toISOString().slice(0, 10);
let echecs = 0;

async function appel(methode: string, chemin: string, jeton?: string, corps?: unknown) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "content-type": "application/json", ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await r.text();
  let json: unknown = texte;
  try { json = JSON.parse(texte); } catch { /* texte brut */ }
  return { statut: r.status, json: json as Record<string, unknown> };
}

function verifier(libelle: string, obtenu: number, attendu: number, detail = "") {
  const ok = obtenu === attendu;
  if (!ok) echecs++;
  console.log(`${ok ? "✔" : "✘"} ${libelle} — ${obtenu}${ok ? "" : ` (attendu ${attendu})`}${detail ? ` · ${detail}` : ""}`);
}

async function connexion(profilId: string) {
  const r = await appel("POST", "/auth/demo", undefined, { profilId });
  return String(r.json.jeton);
}

// Sécurité de l'authentification
verifier("Indicateur sans jeton", (await appel("POST", "/indicateurs", undefined, {})).statut, 401);
verifier("Jeton falsifié", (await appel("GET", "/moi", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwLWRwbyJ9.faux")).statut, 401);
verifier("Profil inexistant", (await appel("POST", "/auth/demo", undefined, { profilId: "p-inconnu" })).statut, 404);

const central = await connexion("p-central");
const departement = await connexion("p-departement");
const enseignant = await connexion("p-enseignant");
const directrice = await connexion("p-directeur");
const dpo = await connexion("p-dpo");

// Couche sémantique alimentée par PostgreSQL
const ind = await appel("POST", "/indicateurs", central, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15, ageMin: 11, ageMax: 13 }, ventilation: ["sexe"] });
verifier("Indicateur national (base réelle)", ind.statut, 200, `valeur ${ind.json.valeur} % · ${(ind.json.lignes as { libelle: string; valeur: number }[]).map((l) => `${l.libelle} ${l.valeur}`).join(", ")}`);
verifier("Champ inconnu dans la requête", (await appel("POST", "/indicateurs", central, { indicateur: "taux_abandon", filtres: { sql: "DROP" }, ventilation: [] })).statut, 422);
const hors = await appel("POST", "/ask", departement, { question: "Quel est le taux d'abandon dans les communes rurales de l'Atacora ?" });
verifier("Ask hors périmètre (Borgou → Atacora)", hors.statut, 200, `statut ${hors.json.statut} · motif ${hors.json.motif}`);
verifier("Indicateur demandé par un enseignant", (await appel("POST", "/indicateurs", enseignant, { indicateur: "taux_abandon", filtres: {}, ventilation: [] })).statut, 403);

// ABAC côté serveur : l'enseignant-parent
verifier("Enseignant → élève de sa classe (évaluation)", (await appel("GET", "/apprenants/APP-000001?finalite=evaluation", enseignant)).statut, 200);
const zoulfath = "APP-000003";
const refus = await appel("GET", `/apprenants/${zoulfath}?finalite=evaluation`, enseignant);
verifier("Enseignant → sa fille, finalité évaluation", refus.statut, 403, String((refus.json.decision as { motif?: string })?.motif ?? ""));
verifier("Enseignant → sa fille, finalité suivi familial", (await appel("GET", `/apprenants/${zoulfath}?finalite=suivi_familial`, enseignant)).statut, 200);

// Appel : relation pédagogique exigée
verifier("Absence saisie en 5e A (sa classe)", (await appel("POST", "/evenements/absences", enseignant, { classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, apprenantIds: ["APP-000001"] })).statut, 201);
verifier("Absence saisie en 3e A (pas sa classe)", (await appel("POST", "/evenements/absences", enseignant, { classeId: "CLS-PAR-3eA-S", date: AUJOURDHUI, apprenantIds: ["APP-000001"] })).statut, 403);
verifier("Absence d'un élève hors de la classe", (await appel("POST", "/evenements/absences", enseignant, { classeId: "CLS-PAR-5eA-S", date: AUJOURDHUI, apprenantIds: [zoulfath] })).statut, 422);

// Un fait, restitué à la direction
const abs = await appel("GET", `/etablissements/ETB-PAR-PILOTE-CEG/absences?date=${AUJOURDHUI}`, directrice);
verifier("Directrice → absences du jour de son CEG", abs.statut, 200, `${(abs.json as unknown as unknown[]).length} absence(s)`);
verifier("Directrice → absences d'un autre établissement", (await appel("GET", `/etablissements/ETB-COT-PILOTE-CEG/absences?date=${AUJOURDHUI}`, directrice)).statut, 403);

// Journal d'audit
verifier("Cabinet → journal d'audit", (await appel("GET", "/audit", central)).statut, 403);
const journal = await appel("GET", "/audit?limite=20", dpo);
const lignes = journal.json as unknown as { autorise: boolean; action: string; critereManquant: string | null }[];
verifier("DPO → journal d'audit", journal.statut, 200, `${lignes.filter((l) => !l.autorise).length} refus parmi les 20 dernières entrées`);

// Vérification publique
verifier("Vérification d'un diplôme authentique", (await appel("GET", "/certificats/CERT-CEP-2024-000001/verification")).statut, 200);

console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette réussie : tous les cas sont conformes.");
process.exit(echecs ? 1 : 0);

export {};
