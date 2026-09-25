import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { connecter, schema } from "./index";

/**
 * Calendrier scolaire officiel. Idempotent : les échéances sont écrites avec un identifiant stable (mise à jour
 * si elles existent). Les anciennes dates provisoires issues de l'initialisation sont retirées ; les saisies de
 * l'administration ne sont jamais touchées.
 *   npm run calendrier -w @beile/db
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

type Categorie = "rentree" | "trimestre" | "conges" | "ferie" | "examen" | "evaluation" | "fin" | "autre";
type Ligne = [titre: string, categorie: Categorie, debut: string, fin: string];

const SOURCE_2026 = "Arrêté interministériel du 28 juillet 2026 — enseignements maternel, primaire, secondaire général et technique, publics et privés (hors lycées techniques agricoles).";
const OFFICIEL: Record<string, { source: string; lignes: Ligne[] }> = {
  "2026-2027": {
    source: SOURCE_2026,
    lignes: [
      ["Pré-rentrée des personnels", "autre", "2026-09-07", "2026-09-11"],
      ["Rentrée scolaire", "rentree", "2026-09-14", "2026-09-14"],
      ["1er trimestre", "trimestre", "2026-09-14", "2026-12-18"],
      ["Congés de fin du 1er trimestre", "conges", "2026-12-18", "2027-01-03"],
      ["2e trimestre", "trimestre", "2027-01-04", "2027-03-24"],
      ["Fête des cultes et traditions du Bénin", "ferie", "2027-01-07", "2027-01-08"],
      ["Congés de détente", "conges", "2027-02-19", "2027-02-28"],
      ["Congés de fin du 2e trimestre", "conges", "2027-03-24", "2027-04-07"],
      ["3e trimestre", "trimestre", "2027-04-08", "2027-06-25"],
      ["Ascension", "ferie", "2027-05-06", "2027-05-06"],
      ["Lundi de Pentecôte", "ferie", "2027-05-17", "2027-05-17"],
      ["Fin des cours", "fin", "2027-06-25", "2027-06-25"],
      ["Grandes vacances", "conges", "2027-06-25", "2027-09-12"],
      ["Reprise des cours (année 2027-2028)", "autre", "2027-09-13", "2027-09-13"],
    ],
  },
};

const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
try {
  // Dates provisoires de l'ancienne initialisation : retirées (jamais d'échéance inventée affichée au public).
  const retirees = await db.delete(schema.calendrier)
    .where(and(eq(schema.calendrier.majPar, "initialisation"), eq(schema.calendrier.statut, "provisoire"))).returning({ id: schema.calendrier.id });
  if (retirees.length) console.log(`${retirees.length} date(s) provisoire(s) d'initialisation retirée(s).`);

  for (const [annee, { source, lignes }] of Object.entries(OFFICIEL)) {
    for (const [i, [titre, categorie, debut, fin]] of lignes.entries()) {
      const valeurs = { annee, titre, categorie, debut, fin, statut: "officiel" as const, note: source, majPar: "calendrier officiel", majLe: new Date() };
      await db.insert(schema.calendrier).values({ id: `CAL-${annee.slice(0, 4)}-O${String(i + 1).padStart(2, "0")}`, ...valeurs })
        .onConflictDoUpdate({ target: schema.calendrier.id, set: valeurs });
    }
    console.log(`${annee} : ${lignes.length} échéances officielles.`);
  }
} finally {
  await client.end();
}
