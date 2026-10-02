import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { connecter, schema } from "./index";
import { genererMotDePasse, hacherMotDePasse } from "./securite";

/**
 * Crée un compte par profil (et le compte administrateur). Les mots de passe initiaux sont générés
 * ici et écrits dans COMPTES.local.md (ignoré par Git) : ils ne transitent ni par le dépôt ni par un tiers.
 * Option --reinitialiser : régénère les mots de passe des comptes existants.
 */
const fichierEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
config({ path: fichierEnv, quiet: true });
const reinitialiser = process.argv.includes("--reinitialiser");
const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

const IDENTIFIANTS: Record<string, string> = {
  "p-central": "felicite.akakpo",
  "p-departement": "bertrand.chabi",
  "p-inspecteur": "nestor.orou",
  "p-directeur": "hortense.guera",
  "p-enseignant": "idrissou.sanni",
  "p-parent": "chantal.dossou",
  "p-apprenant": "aicha.zannou",
  "p-chercheur": "landry.kouton",
  "p-dpo": "laure.zannou",
  "p-admin": "admin.beile",
  // Volet supérieur (profils posés par `npm run superieur`).
  "p-directeur-ifri": "prosper.ahouandjinou",
  "p-enseignant-sup": "sena.hounkpatin",
  "p-etudiant": "etudiant.ifri",
};

/**
 * Mots de passe déjà consignés : relancer le script pour AJOUTER des comptes ne doit jamais effacer du
 * fichier ceux des comptes existants (en production, ce fichier est la seule copie des mots de passe).
 */
const fichierComptes = process.env.BEILE_FICHIER_COMPTES ?? fileURLToPath(new URL("../../../COMPTES.local.md", import.meta.url));
const connus = new Map<string, string>();
/** Secrets TOTP des comptes de test (enregistrés par « npm run mfa:comptes-test -w @beile/api »), gardés tant que le compte l'est. */
const totpConnus = new Map<string, string>();
const totpGardes: string[] = [];
if (existsSync(fichierComptes)) {
  for (const m of readFileSync(fichierComptes, "utf8").matchAll(/\| `([^`]+)` \| `([^`]+)` \|/g)) connus.set(m[1]!, m[2]!);
  for (const m of readFileSync(fichierComptes, "utf8").matchAll(/^- TOTP `([^`]+)` : `([A-Z2-7]+)`/gm)) totpConnus.set(m[1]!, m[2]!);
}

try {
  const [admin] = await db.select().from(schema.profils).where(eq(schema.profils.id, "p-admin"));
  if (!admin) {
    await db.insert(schema.profils).values({ id: "p-admin", nomAffiche: "Administration BEILE", fonction: "Administrateur de la plateforme · gestion des comptes", npi: null, habilitations: [{ role: "administrateur", perimetre: { niveau: "national" } }] });
  }
  const profils = await db.select().from(schema.profils);
  const lignes: string[] = [];
  for (const p of profils) {
    const identifiant = IDENTIFIANTS[p.id];
    if (!identifiant) continue;
    const [existant] = await db.select().from(schema.comptes).where(eq(schema.comptes.profilId, p.id));
    if (existant && !reinitialiser) {
      const mdp = connus.get(existant.identifiant);
      lignes.push(`| ${p.nomAffiche} | ${p.fonction} | \`${existant.identifiant}\` | ${mdp ? `\`${mdp}\`` : "(inchangé)"} |`);
      const totp = totpConnus.get(existant.identifiant);
      if (totp) totpGardes.push(`- TOTP \`${existant.identifiant}\` : \`${totp}\``);
      continue;
    }
    const motDePasse = genererMotDePasse();
    const hash = await hacherMotDePasse(motDePasse);
    // Secret TOTP perdu avec l'ancien fichier : le second facteur est remis à zéro (nouvel enregistrement à faire).
    if (existant) await db.update(schema.comptes).set({ motDePasseHash: hash, echecsConsecutifs: 0, verrouilleJusquA: null, actif: true, mfaActive: false, totpChiffre: null, totpDernierPas: null, demonstration: true }).where(eq(schema.comptes.id, existant.id));
    else await db.insert(schema.comptes).values({ id: `CPT-${p.id.slice(2)}`, identifiant, motDePasseHash: hash, profilId: p.id, demonstration: true });
    lignes.push(`| ${p.nomAffiche} | ${p.fonction} | \`${identifiant}\` | \`${motDePasse}\` |`);
  }
  const doc = [
    "# Comptes BEILE — CONFIDENTIEL (ne pas commiter, ne pas diffuser publiquement)",
    "",
    `Générés le ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. Connexion : page /connexion.`,
    "",
    "| Personne | Fonction | Identifiant | Mot de passe |",
    "|---|---|---|---|",
    ...lignes,
    "",
    ...(totpGardes.length ? ["## Second facteur des comptes de test (TOTP, à saisir dans une application d'authentification)", "", ...totpGardes, ""] : []),
  ].join("\n");
  writeFileSync(fichierComptes, doc);
  console.log(`${lignes.length} comptes prêts ; identifiants écrits dans COMPTES.local.md (mots de passe non affichés).`);
} finally {
  await client.end();
}
