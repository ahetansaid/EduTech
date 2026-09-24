import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

/** Configuration validée au démarrage : l'API refuse de démarrer avec une configuration incomplète ou faible. */

const Schema = z.object({
  DATABASE_URL_API: z.string().url().refine((u) => !u.includes("neondb_owner"), "L'API ne doit pas utiliser le rôle propriétaire (BYPASSRLS)"),
  BEILE_JWT_SECRET: z.string().min(48, "Secret de signature trop court (48 caractères minimum)"),
  BEILE_MODE_DEMO: z.enum(["true", "false"]).default("false"),
  BEILE_ORIGINES_AUTORISEES: z.string().default("http://localhost:3000"),
  NODE_ENV: z.string().optional(),
});

/** Validation paresseuse : exécutée à la première requête (le build de production n'a pas besoin de la base). */
let cache: ReturnType<typeof valider> | null = null;
export function lireEnv() {
  cache ??= valider();
  return cache;
}

function valider() {
// .env du dépôt, cherché en remontant depuis le répertoire courant (développement local uniquement ;
// en production, les variables sont fournies par l'hébergeur et ce fichier n'existe pas).
for (let dossier = process.cwd(), i = 0; i < 4; i++, dossier = dirname(dossier)) {
  if (existsSync(join(dossier, ".env"))) { config({ path: join(dossier, ".env"), quiet: true }); break; }
}
const brut = Schema.safeParse(process.env);
if (!brut.success) {
  throw new Error(`Configuration de l'API invalide : ${brut.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join(" ; ")}`);
}
const v = brut.data;
// Le mode démonstration (connexion par profil fictif) n'est admis qu'avec des données fictives, jamais sur une base réelle.
if (process.env.BEILE_DONNEES_REELLES === "true" && v.BEILE_MODE_DEMO === "true") {
  throw new Error("BEILE_MODE_DEMO est interdit lorsque BEILE_DONNEES_REELLES=true.");
}

return {
  DATABASE_URL_API: v.DATABASE_URL_API,
  JWT_SECRET: v.BEILE_JWT_SECRET,
  MODE_DEMO: v.BEILE_MODE_DEMO === "true",
  ORIGINES: v.BEILE_ORIGINES_AUTORISEES.split(",").map((o) => o.trim()),
};
}
