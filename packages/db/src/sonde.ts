import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";

/** Sonde de connexion : vérifie les deux URL (mutualisée et directe) et la disponibilité de PostGIS. */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
for (const k of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const) {
  const s = postgres(process.env[k]!, { ssl: "require", max: 1 });
  const [r] = await s<{ version: string; db: string; postgis: string }[]>`select version(), current_database() as db, (select count(*) from pg_available_extensions where name = 'postgis')::text as postgis`;
  console.log(k, "→", r?.db, String(r?.version).split(" ").slice(0, 2).join(" "), "· PostGIS disponible :", r?.postgis === "1" ? "oui" : "non");
  await s.end();
}
