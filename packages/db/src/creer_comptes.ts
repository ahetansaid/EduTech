import { writeFileSync } from "node:fs";
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
};

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
    if (existant && !reinitialiser) { lignes.push(`| ${p.nomAffiche} | ${p.fonction} | \`${existant.identifiant}\` | (inchangé) |`); continue; }
    const motDePasse = genererMotDePasse();
    const hash = await hacherMotDePasse(motDePasse);
    if (existant) await db.update(schema.comptes).set({ motDePasseHash: hash, echecsConsecutifs: 0, verrouilleJusquA: null, actif: true }).where(eq(schema.comptes.id, existant.id));
    else await db.insert(schema.comptes).values({ id: `CPT-${p.id.slice(2)}`, identifiant, motDePasseHash: hash, profilId: p.id });
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
  ].join("\n");
  writeFileSync(process.env.BEILE_FICHIER_COMPTES ?? fileURLToPath(new URL("../../../COMPTES.local.md", import.meta.url)), doc);
  console.log(`${lignes.length} comptes prêts ; identifiants écrits dans COMPTES.local.md (mots de passe non affichés).`);
} finally {
  await client.end();
}
