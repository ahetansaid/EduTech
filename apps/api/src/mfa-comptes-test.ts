import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { codeTotp } from "@beile/db/securite";
import { COMPTES, Session, TOTP } from "./client-recette";

/**
 * Enregistre le second facteur (TOTP) des comptes de test qui l'exigent (administrateurs de niveau 0 à 2),
 * EN PASSANT PAR L'API comme le ferait la personne, puis écrit chaque secret dans COMPTES.local.md
 * (ignoré par Git) : la recette et les testeurs calculent ainsi leurs codes. Idempotent : un compte déjà
 * enregistré dont le secret est connu est laissé tel quel.
 *
 *   npm run mfa:comptes-test -w @beile/api        (API démarrée ; BEILE_API pour une autre adresse)
 */
function fichier(): string {
  if (process.env.BEILE_FICHIER_COMPTES) return process.env.BEILE_FICHIER_COMPTES;
  for (let d = process.cwd(), i = 0; i < 4; i++, d = dirname(d)) {
    try { readFileSync(join(d, "COMPTES.local.md")); return join(d, "COMPTES.local.md"); } catch { /* dossier suivant */ }
  }
  throw new Error("COMPTES.local.md introuvable");
}

const chemin = fichier();
const nouveaux: [string, string][] = [];
let echecs = 0;
for (const identifiant of Object.keys(COMPTES)) {
  const s = new Session();
  const r = await s.connexion(identifiant);
  if (r.statut !== 200) { console.log(`✘ ${identifiant} : connexion ${r.statut}`); echecs++; continue; }
  const etape = r.json.etape as string | null;
  if (etape === "mfa_a_verifier") {
    console.log(`${TOTP[identifiant] ? "✔" : "✘"} ${identifiant} : second facteur déjà enregistré${TOTP[identifiant] ? "" : " — secret inconnu (réinitialisation par l'administrateur nécessaire)"}`);
    if (!TOTP[identifiant]) echecs++;
    continue;
  }
  if (etape !== "mfa_a_enroler") continue;
  const debut = await s.appel("POST", "/auth/mfa/totp/debut", {});
  const secret = String(debut.json.secret ?? "");
  const conf = await s.appel("POST", "/auth/mfa/totp/confirmer", { code: codeTotp(secret) });
  if (conf.statut !== 200) { console.log(`✘ ${identifiant} : enregistrement refusé (${conf.statut})`); echecs++; continue; }
  nouveaux.push([identifiant, secret]);
  console.log(`✔ ${identifiant} : second facteur enregistré (secret écrit dans COMPTES.local.md)`);
  await s.appel("POST", "/auth/deconnexion", {});
}

if (nouveaux.length) {
  let texte = readFileSync(chemin, "utf8");
  for (const [id] of nouveaux) texte = texte.replace(new RegExp(`^- TOTP \`${id.replace(/\./g, "\\.")}\` : .*\\n`, "m"), "");
  const titre = "## Second facteur des comptes de test (TOTP, à saisir dans une application d'authentification)";
  if (!texte.includes(titre)) texte = `${texte.trimEnd()}\n\n${titre}\n\n`;
  texte = `${texte.trimEnd()}\n${nouveaux.map(([id, s]) => `- TOTP \`${id}\` : \`${s}\``).join("\n")}\n`;
  writeFileSync(chemin, texte);
}
console.log(`\n${nouveaux.length} enregistrement(s), ${echecs} échec(s).`);
process.exit(echecs ? 1 : 0);
