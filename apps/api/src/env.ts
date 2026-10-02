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
  /**
   * Secrets des systèmes partenaires (interopérabilité), « id:secret » séparés par des virgules. Un
   * partenaire absent de la liste n'est pas authentifiable : son connecteur est simplement fermé.
   */
  BEILE_PARTENAIRES: z.string().optional(),
  /**
   * Envoi des codes à usage unique. SMS : passerelle HTTP d'un opérateur national (POST JSON
   * { to, from, text } avec en-tête Authorization: Bearer). Courriel : SMTP du domaine de la plateforme
   * (SPF, DKIM, DMARC), jamais une messagerie personnelle. Sans fournisseur, l'envoi est « journal » :
   * accepté hors production pour la recette, refusé en production (le service l'annonce honnêtement).
   */
  BEILE_SMS_URL: z.string().url().optional(),
  BEILE_SMS_CLE: z.string().min(16).optional(),
  BEILE_SMS_EXPEDITEUR: z.string().max(11).default("BEILE"),
  BEILE_SMTP_URL: z.string().optional(),
  BEILE_COURRIEL_EXPEDITEUR: z.string().email().optional(),
  /** Relying Party FIDO2 : domaine du portail (sans schéma), et nom affiché par l'authentificateur. */
  BEILE_WEBAUTHN_RP_ID: z.string().optional(),
  /** Portail servi par cette instance (lot D) : « unique » (tout), « public », « usagers », « gestion », « national ». */
  BEILE_PORTAIL: z.enum(["unique", "public", "usagers", "gestion", "national"]).default("unique"),
  /** Plages d'adresses autorisées (liste d'IP ou de préfixes « 10.0. »), exigées pour le portail national. */
  BEILE_IP_AUTORISEES: z.string().optional(),
  /**
   * Origine de l'adresse du client (limites de débit, liste d'adresses, journal) : « vercel » (la plateforme
   * écrase X-Forwarded-For), « mandataire » (BEILE_MANDATAIRES mandataires de confiance devant l'API, ex. nginx),
   * « socket » (connexion TCP directe). Par défaut : « vercel » sur Vercel, « socket » ailleurs.
   */
  BEILE_SOURCE_IP: z.enum(["vercel", "mandataire", "socket"]).optional(),
  BEILE_MANDATAIRES: z.coerce.number().int().min(1).max(5).default(1),
  /** Clé maîtresse des secrets dérivés (codes, TOTP, défis) ; à défaut la clé du sceau. Distincte : la rotation du sceau ne touche pas aux secrets TOTP. */
  BEILE_CLE_MAITRESSE: z.string().min(32).optional(),
  NODE_ENV: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
}).superRefine((v, ctx) => {
  if (estProduction(v) && !v.BEILE_CLE_SEAU) {
    ctx.addIssue({ code: "custom", path: ["BEILE_CLE_SEAU"], message: "obligatoire en production et en prévisualisation (diplômes et actes scellés par MAC, secrets dérivés)" });
  }
  if (v.BEILE_SMS_URL && !v.BEILE_SMS_CLE) ctx.addIssue({ code: "custom", path: ["BEILE_SMS_CLE"], message: "requise avec BEILE_SMS_URL" });
  if (v.BEILE_SMTP_URL && !v.BEILE_COURRIEL_EXPEDITEUR) ctx.addIssue({ code: "custom", path: ["BEILE_COURRIEL_EXPEDITEUR"], message: "requis avec BEILE_SMTP_URL (adresse du domaine de la plateforme)" });
  if (v.BEILE_PORTAIL === "national" && !v.BEILE_IP_AUTORISEES) ctx.addIssue({ code: "custom", path: ["BEILE_IP_AUTORISEES"], message: "obligatoire pour le portail national (hors Internet public)" });
  for (const paire of (v.BEILE_PARTENAIRES ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [id, secret] = paire.split(":");
    if (!id || !secret || secret.length < 32) ctx.addIssue({ code: "custom", path: ["BEILE_PARTENAIRES"], message: "format « id:secret », secret d'au moins 32 caractères" });
  }
  for (const cle of (v.BEILE_CLES_SEAU_ANCIENNES ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
    if (cle.length < 32) ctx.addIssue({ code: "custom", path: ["BEILE_CLES_SEAU_ANCIENNES"], message: "chaque clef fait au moins 32 caractères" });
  }
});

/**
 * Production : tout déploiement hébergé (production ET prévisualisation Vercel) ou NODE_ENV=production. Une
 * prévisualisation traitée en « développement » garderait les codes en clair et une clé maîtresse faible.
 */
function estProduction(v: { NODE_ENV?: string; VERCEL_ENV?: string }) {
  return v.VERCEL_ENV === "production" || v.VERCEL_ENV === "preview" || v.NODE_ENV === "production";
}

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
  /** Secrets partagés des systèmes partenaires, par identifiant. */
  PARTENAIRES: Object.fromEntries((v.BEILE_PARTENAIRES ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    .map((paire) => [paire.slice(0, paire.indexOf(":")), paire.slice(paire.indexOf(":") + 1)])) as Record<string, string>,
  PRODUCTION: estProduction(v),
  SOURCE_IP: v.BEILE_SOURCE_IP ?? (v.VERCEL ? "vercel" : "socket"),
  MANDATAIRES: v.BEILE_MANDATAIRES,
  CLE_MAITRESSE: v.BEILE_CLE_MAITRESSE ?? v.BEILE_CLE_SEAU ?? null,
  SMS: v.BEILE_SMS_URL ? { url: v.BEILE_SMS_URL, cle: v.BEILE_SMS_CLE!, expediteur: v.BEILE_SMS_EXPEDITEUR } : null,
  SMTP: v.BEILE_SMTP_URL ? { url: v.BEILE_SMTP_URL, expediteur: v.BEILE_COURRIEL_EXPEDITEUR! } : null,
  RP_ID: v.BEILE_WEBAUTHN_RP_ID ?? null,
  PORTAIL: v.BEILE_PORTAIL,
  IP_AUTORISEES: (v.BEILE_IP_AUTORISEES ?? "").split(",").map((x) => x.trim()).filter(Boolean),
  /** Clefs acceptées à la vérification : l'active d'abord, puis les anciennes (rotation). */
  CLES_VERIFICATION: [v.BEILE_CLE_SEAU, ...(v.BEILE_CLES_SEAU_ANCIENNES ?? "").split(",").map((x) => x.trim()).filter(Boolean)]
    .filter((x): x is string => !!x),
};
}
