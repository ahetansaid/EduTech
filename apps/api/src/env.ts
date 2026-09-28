import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";
import { z } from "zod";

/** Configuration validée au démarrage : l'API refuse de démarrer avec une configuration incomplète ou faible. */

const Schema = z.object({
  DATABASE_URL_API: z.string().url().refine((u) => !u.includes("neondb_owner"), "L'API ne doit pas utiliser le rôle propriétaire (BYPASSRLS)"),
  BEILE_ORIGINES_AUTORISEES: z.string().default("http://localhost:3000"),
  /**
   * Clef du sceau d'acte. Optionnelle à dessein : son absence ne casse aucune lecture, le condensé
   * redevient simplement non keyé — donc recalculable par qui peut écrire dans la table. Fournie par
   * l'hébergeur, elle fait du sceau un MAC : avancer en base une date de mise à disposition se lit
   * alors comme un acte « altéré », au lieu de passer pour un acte régulier.
   * Un MAC prouve l'intégrité, pas la non-répudiation — toutes les instances de l'API partagent la
   * clef. OBLIGATOIRE en production (voir plus bas) : sans elle, un diplôme scellé ne résisterait pas à
   * qui peut écrire dans la base.
   */
  BEILE_CLE_SEAU: z.string().min(32).optional(),
  /**
   * Anciennes clefs, séparées par des virgules : une rotation ne rend jamais « altéré » un document déjà
   * remis. On scelle toujours avec la clef active ; on vérifie avec la clef active PUIS les anciennes.
   */
  BEILE_CLES_SEAU_ANCIENNES: z.string().optional(),
  NODE_ENV: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
}).superRefine((v, ctx) => {
  const production = v.VERCEL_ENV === "production" || v.NODE_ENV === "production";
  if (production && !v.BEILE_CLE_SEAU) {
    ctx.addIssue({ code: "custom", path: ["BEILE_CLE_SEAU"], message: "obligatoire en production (diplômes et actes scellés par MAC)" });
  }
  for (const cle of (v.BEILE_CLES_SEAU_ANCIENNES ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (cle.length < 32) ctx.addIssue({ code: "custom", path: ["BEILE_CLES_SEAU_ANCIENNES"], message: "chaque clef fait au moins 32 caractères" });
  }
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

return {
  DATABASE_URL_API: v.DATABASE_URL_API,
  ORIGINES: v.BEILE_ORIGINES_AUTORISEES.split(",").map((o) => o.trim()),
  CLE_SEAU: v.BEILE_CLE_SEAU,
  /** Clefs acceptées à la vérification : l'active d'abord, puis les anciennes (rotation). */
  CLES_VERIFICATION: [v.BEILE_CLE_SEAU, ...(v.BEILE_CLES_SEAU_ANCIENNES ?? "").split(",").map((x) => x.trim()).filter(Boolean)]
    .filter((x): x is string => !!x),
};
}
