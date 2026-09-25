import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { tls } from "./index";

/**
 * Crée (ou réinitialise) le rôle de connexion de l'API : beile_api, membre de beile_app (droits minimaux,
 * sans BYPASSRLS). Le mot de passe est généré ici et écrit directement dans .env : il ne transite nulle part.
 */
const fichierEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
config({ path: fichierEnv, quiet: true });
const direct = process.env.DATABASE_URL_UNPOOLED;
if (!direct) throw new Error("DATABASE_URL_UNPOOLED absent");

const motDePasse = randomBytes(24).toString("base64url");
const s = postgres(direct, { ssl: tls(direct), max: 1, onnotice: () => {} });
try {
  const [existe] = await s`select 1 as ok from pg_roles where rolname = 'beile_api'`;
  if (existe) await s.unsafe(`ALTER ROLE beile_api WITH LOGIN NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${motDePasse}'`);
  else await s.unsafe(`CREATE ROLE beile_api WITH LOGIN NOBYPASSRLS NOCREATEROLE NOCREATEDB PASSWORD '${motDePasse}' IN ROLE beile_app`);
  await s.unsafe("GRANT beile_app TO beile_api");
} finally {
  await s.end();
}

const mutualise = new URL(process.env.DATABASE_URL!);
mutualise.username = "beile_api";
mutualise.password = motDePasse;
const contenu = readFileSync(fichierEnv, "utf8").split(/\r?\n/).filter((l) => !l.startsWith("DATABASE_URL_API=")).join("\n").trimEnd();
writeFileSync(fichierEnv, `${contenu}\n# Rôle applicatif de l'API (beile_api ⊂ beile_app, sans BYPASSRLS) — généré par creer_role_api.ts\nDATABASE_URL_API=${mutualise.toString()}\n`);
console.log("Rôle beile_api prêt ; DATABASE_URL_API écrite dans .env (mot de passe non affiché).");
