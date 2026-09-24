import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { z } from "zod";

/** Configuration validée au démarrage : l'API refuse de démarrer avec une configuration incomplète ou faible. */
const fichier = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(fichier)) config({ path: fichier, quiet: true });

const Schema = z.object({
  DATABASE_URL_API: z.string().url().refine((u) => !u.includes("neondb_owner"), "L'API ne doit pas utiliser le rôle propriétaire (BYPASSRLS)"),
  BEILE_JWT_SECRET: z.string().min(48, "Secret de signature trop court (48 caractères minimum)"),
  BEILE_MODE_DEMO: z.enum(["true", "false"]).default("false"),
  BEILE_ORIGINES_AUTORISEES: z.string().default("http://localhost:3000"),
  NODE_ENV: z.string().optional(),
});

const brut = Schema.safeParse(process.env);
if (!brut.success) {
  console.error("Configuration invalide :", brut.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; "));
  process.exit(1);
}
const v = brut.data;
if (v.NODE_ENV === "production" && v.BEILE_MODE_DEMO === "true") {
  console.error("BEILE_MODE_DEMO est interdit en production.");
  process.exit(1);
}

export const env = {
  DATABASE_URL_API: v.DATABASE_URL_API,
  JWT_SECRET: v.BEILE_JWT_SECRET,
  MODE_DEMO: v.BEILE_MODE_DEMO === "true",
  ORIGINES: v.BEILE_ORIGINES_AUTORISEES.split(",").map((o) => o.trim()),
};
