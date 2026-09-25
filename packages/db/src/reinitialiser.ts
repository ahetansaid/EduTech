import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { tls } from "./index";

/**
 * Remise à zéro complète d'une base BEILE : supprime les schémas applicatifs puis reconstruit tout
 * (migrations, durcissement, peuplement, comptes, projections, vérification).
 *
 * IRRÉVERSIBLE. Le registre en ajout seul interdit tout effacement ligne à ligne : la seule remise à zéro
 * possible est la suppression des schémas par le rôle propriétaire. Garde-fou : l'hôte visé doit être recopié.
 *
 *   npm run reinitialiser -w @beile/db <hôte de la base>
 *
 * Les rôles (beile_app, beile_api) sont conservés : DATABASE_URL_API reste valable.
 * Les comptes sont recréés avec de NOUVEAUX mots de passe, écrits dans COMPTES.local.md.
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED absent : renseigner .env à la racine du dépôt.");
const cible = new URL(url);
const hote = cible.hostname;
// « --confirmer <hôte> », ou l'hôte seul : PowerShell et npm consomment parfois « -- » et « --confirmer ».
// Dans tous les cas, l'hôte exact doit être recopié par la personne qui lance la remise à zéro.
const i = process.argv.indexOf("--confirmer");
const confirmation = i > 0 ? process.argv[i + 1] : process.argv.slice(2).find((a) => a === hote);

if (confirmation !== hote) {
  console.error(`\nRemise à zéro de la base « ${cible.pathname.slice(1)} » sur ${hote}.`);
  console.error("Toutes les données BEILE seront DÉFINITIVEMENT supprimées puis reconstruites.");
  console.error(`Pour confirmer :  npm run reinitialiser -w @beile/db ${hote}\n`);
  process.exit(1);
}

const SCHEMAS = ["core", "ledger", "audit", "analytics", "workflow", "sensible", "gouvernance", "registre_simule", "drizzle"];
const s = postgres(url, { ssl: tls(url), max: 1, onnotice: () => {} });
try {
  const debut = Date.now();
  await s.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMAS.join(", ")} CASCADE`);
  console.log(`1/6 Schémas supprimés (${SCHEMAS.length}) en ${Date.now() - debut} ms.`);
} finally {
  await s.end();
}

const etapes: [string, string][] = [
  ["2/6 Migrations et durcissement", "src/migrer.ts"],
  ["3/6 Peuplement", "src/peupler.ts"],
  ["4/6 Comptes (nouveaux mots de passe → COMPTES.local.md)", "src/creer_comptes.ts"],
  ["5/6 Projections de lecture", "src/projections.ts"],
  ["6/6 Vérification (ajout seul, droits, RLS)", "src/verifier.ts"],
];
for (const [libelle, script] of etapes) {
  console.log(`\n${libelle}…`);
  const r = spawnSync(process.execPath, ["--import", "tsx", script], { stdio: "inherit", cwd: fileURLToPath(new URL("..", import.meta.url)), env: process.env });
  if (r.status !== 0) { console.error(`Échec à l'étape « ${libelle} » : base à reconstruire (relancer la commande).`); process.exit(1); }
}
console.log("\nBase remise à zéro et vérifiée. Identifiants : COMPTES.local.md (ignoré par Git).");
