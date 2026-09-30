import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";
import * as t from "./schema";

/**
 * Chargement du référentiel réel des établissements (annuaire public) depuis
 * packages/db/data/referentiel-etablissements.csv : listes officielles des ministères et cartographie
 * OpenStreetMap (© contributeurs OSM, ODbL). Idempotent : le référentiel est remplacé en entier, dans
 * une transaction (aucun état intermédiaire visible). Lancé par le propriétaire : l'API n'y a qu'un
 * droit de lecture.   npm run referentiel -w @beile/db
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

/** Lecture CSV « ; » avec champs entre guillemets (échappement par doublement). */
function lireCsv(texte: string): Record<string, string>[] {
  const lignes: string[][] = [];
  let champ = "", ligne: string[] = [], guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]!;
    if (guillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; } else if (c === '"') guillemets = false; else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ";") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && texte[i + 1] === "\n") i++; ligne.push(champ); champ = ""; if (ligne.some((x) => x !== "")) lignes.push(ligne); ligne = []; }
    else champ += c;
  }
  if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete!.map((k, i) => [k.replace(/^﻿/, ""), l[i] ?? ""])));
}

const STATUTS = new Set(["public", "prive", "confessionnel", "communautaire", "non_indique"]);
const PREUVES = new Set(["officielle", "recoupee", "cartographie_collaborative"]);

export async function chargerReferentiel(url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL) {
  const lignes = lireCsv(readFileSync(new URL("../data/referentiel-etablissements.csv", import.meta.url), "utf8"));
  const { db, client } = connecter(url);
  try {
    const communes = new Set((await db.select({ id: t.communes.id }).from(t.communes)).map((c) => c.id));
    if (!communes.size) throw new Error("Territoire absent : charger le socle avant le référentiel.");
    const valeurs = lignes.map((l) => {
      if (!STATUTS.has(l.statut!) || !PREUVES.has(l.preuve!)) throw new Error(`Ligne ${l.id} : statut ou preuve hors référentiel`);
      const lat = Number(l.latitude), lng = Number(l.longitude);
      const position = l.latitude && l.longitude && Number.isFinite(lat) && Number.isFinite(lng) ? sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)` : null;
      return {
        id: l.id!, nom: l.nom!, sigle: l.sigle || null, type: l.type!, typeLibelle: l.type_libelle!,
        niveaux: l.niveaux ? l.niveaux.split("|") : [],
        statut: l.statut as (typeof t.referentielEtablissements.statut.enumValues)[number],
        communeId: l.commune_id && communes.has(l.commune_id) ? l.commune_id : null,
        rattachement: l.rattachement || null, position: position as unknown as string | null,
        source: l.source!, preuve: l.preuve as (typeof t.referentielEtablissements.preuve.enumValues)[number], remarque: l.remarque || null,
      };
    });
    await db.transaction(async (tx) => {
      await tx.delete(t.referentielEtablissements);
      for (let i = 0; i < valeurs.length; i += 500) await tx.insert(t.referentielEtablissements).values(valeurs.slice(i, i + 500));
    });
    const [n] = (await db.execute(sql`select count(*)::int total, count(position)::int localises, count(commune_id)::int rattaches from core.referentiel_etablissements`)) as unknown as { total: number; localises: number; rattaches: number }[];
    console.log(`Référentiel chargé : ${n!.total} établissements réels · ${n!.localises} localisés · ${n!.rattaches} rattachés à une commune.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await chargerReferentiel();
