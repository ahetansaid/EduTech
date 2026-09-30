import { fileURLToPath } from "node:url";
import type { Habilitation } from "@beile/contracts";
import { genererMicroMonde } from "@beile/simulation/micro";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";
import { chargerReferentiel } from "./referentiel";
import * as t from "./schema";
import { chargerConfiguration, chargerTerritoire } from "./socle";

/**
 * Peuplement RÉEL d'une base BEILE (production) : uniquement des données vraies ou de configuration.
 * - socle : territoire officiel (départements, communes) et configuration (circuits, gouvernance) ;
 * - référentiel réel des établissements (annuaire public, sources officielles et OpenStreetMap) ;
 * - profils des comptes de test (conservés à la demande, sans aucune donnée derrière).
 * Aucun élève, aucune note, aucun indicateur simulé : la plateforme se remplit par la saisie des
 * établissements et par les connecteurs des systèmes nationaux.
 *   npm run reel -w @beile/db      (sur une base migrée et vide)
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const { db, client } = connecter(url);

/** Profils du supérieur conservés pour les comptes de test : aucune donnée ne leur est rattachée. */
const PROFILS_SUPERIEUR: { id: string; nomAffiche: string; fonction: string; npi: string | null; habilitations: Habilitation[] }[] = [
  { id: "p-directeur-ifri", nomAffiche: "Prosper AHOUANDJINOU", fonction: "Directeur de l'IFRI · Université d'Abomey-Calavi", npi: null, habilitations: [{ role: "chef_etablissement", perimetre: { niveau: "etablissement", etablissementId: "ETB-SUP-UAC-IFRI" } }] },
  { id: "p-enseignant-sup", nomAffiche: "Sèna HOUNKPATIN", fonction: "Maîtresse de conférences · IFRI (UAC)", npi: null, habilitations: [{ role: "enseignant", perimetre: { niveau: "etablissement", etablissementId: "ETB-SUP-UAC-IFRI" } }] },
  { id: "p-etudiant", nomAffiche: "Étudiant·e IFRI", fonction: "Étudiant·e · IFRI (UAC)", npi: null, habilitations: [{ role: "apprenant", perimetre: { niveau: "personnel", apprenantId: "APP-900000" } }] },
];

try {
  const [deja] = (await db.execute(sql`select (select count(*) from core.departements)::int dep, (select count(*) from core.etablissements)::int etab`)) as unknown as { dep: number; etab: number }[];
  if ((deja?.dep ?? 0) > 0) throw new Error("Base déjà peuplée : le peuplement réel part d'une base migrée et vide (npm run reinitialiser -- --reel).");
  const profils = genererMicroMonde().profils;
  await db.transaction(async (tx) => {
    await chargerTerritoire(tx);
    await chargerConfiguration(tx);
    await tx.insert(t.profils).values([...profils, ...PROFILS_SUPERIEUR]);
  });
  console.log(`Socle réel chargé : territoire, configuration, ${profils.length + PROFILS_SUPERIEUR.length} profils de test (sans données).`);
} finally {
  await client.end();
}
await chargerReferentiel(url);
