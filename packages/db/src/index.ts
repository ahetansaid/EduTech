import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Client PostgreSQL unique pour Neon (MVP) et PostgreSQL souverain (cible) : même pilote, seule
 * la chaîne de connexion change. TLS exigé ; connexions limitées pour les fonctions serverless.
 */
/** TLS exigé par défaut ; désactivable uniquement par un `sslmode=disable` explicite (base locale jetable). */
export const tls = (url: string) => (/[?&]sslmode=disable(&|$)/.test(url) ? false : ("require" as const));

export function connecter(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL absent : copier .env.example en .env et renseigner la connexion Neon.");
  const client = postgres(url, { max: Number(process.env.BEILE_DB_POOL ?? 10), ssl: tls(url), prepare: false, idle_timeout: 20 });
  return { db: drizzle(client, { schema }), client };
}

export { schema };
export type Base = ReturnType<typeof connecter>["db"];
