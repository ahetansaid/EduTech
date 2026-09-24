import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Migration : extensions → schéma Drizzle → durcissement (ajout seul, RLS). Connexion directe (non mutualisée). */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED absent : renseigner .env à la racine du dépôt.");

const client = postgres(url, { max: 1, ssl: "require", onnotice: () => {} });
try {
  await client.unsafe("CREATE EXTENSION IF NOT EXISTS postgis");
  await migrate(drizzle(client), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  await client.unsafe(readFileSync(new URL("./durcissement.sql", import.meta.url), "utf8"));
  const [ligne] = await client<{ version: string }[]>`select postgis_full_version() as version`;
  console.log("Migrations appliquées. PostGIS :", String(ligne?.version).split(" ").slice(0, 2).join(" "));
} finally {
  await client.end();
}
