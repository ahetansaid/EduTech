import { schema } from "@beile/db";
import { and, count, eq, gte, ilike, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { base } from "./commun";
import { lireEnv } from "./env";

/**
 * Registre national des personnes : la seule porte de l'API vers l'identité civile et la filiation.
 * L'identité appartient à l'ANIP : BEILE la consulte à la demande et n'en recopie que le nécessaire.
 * Aujourd'hui, seule la réalisation simulée existe (schéma `registre_simule`). Le client ANIP s'écrira contre
 * ce contrat, une fois la convention signée et l'interface connue — aucune route n'aura à changer.
 */
export interface PersonneRegistre {
  npi: string;
  nom: string;
  prenoms: string;
  dateNaissance: string;
  sexe: "F" | "M";
  parentsNpi: string[];
}

export interface RegistreNational {
  parNpi(npi: string): Promise<PersonneRegistre | null>;
  parNpis(npis: string[]): Promise<PersonneRegistre[]>;
  /** Nom ET prénoms obligatoires : le registre n'est pas un annuaire. `neApres` borne aux enfants en âge scolaire. */
  rechercher(critere: { nom: string; prenoms: string; neApres: string; limite: number }): Promise<PersonneRegistre[]>;
  /** Nombre de personnes consultables ; null quand le registre ne le dit pas (l'ANIP n'a pas à l'exposer). */
  volume(): Promise<number | null>;
}

const COLONNES = {
  npi: schema.personnes.npi, nom: schema.personnes.nom, prenoms: schema.personnes.prenoms,
  dateNaissance: schema.personnes.dateNaissance, sexe: schema.personnes.sexe, parentsNpi: schema.personnes.parentsNpi,
};
const sansJoker = (t: string) => t.replace(/[%_]/g, "");

const registreSimule: RegistreNational = {
  async parNpi(npi) {
    const [p] = await base().select(COLONNES).from(schema.personnes).where(eq(schema.personnes.npi, npi));
    return p ?? null;
  },
  async parNpis(npis) {
    return npis.length ? base().select(COLONNES).from(schema.personnes).where(inArray(schema.personnes.npi, npis)) : [];
  },
  async rechercher({ nom, prenoms, neApres, limite }) {
    return base().select(COLONNES).from(schema.personnes)
      .where(and(gte(schema.personnes.dateNaissance, neApres), ilike(schema.personnes.nom, `%${sansJoker(nom)}%`), ilike(schema.personnes.prenoms, `%${sansJoker(prenoms)}%`)))
      .limit(limite);
  },
  async volume() {
    const [l] = await base().select({ n: count() }).from(schema.personnes);
    return l?.n ?? 0;
  },
};

// Sélectionné sans client écrit : on refuse. Retomber en silence sur la simulation ferait passer des identités
// fictives pour des identités vérifiées par l'État.
const indisponible = async (): Promise<never> => { throw new HTTPException(503, { message: "Registre national indisponible : le raccordement à l'ANIP n'est pas en service" }); };
const registreAnip: RegistreNational = { parNpi: indisponible, parNpis: indisponible, rechercher: indisponible, volume: indisponible };

export const registreNational = (): RegistreNational => (lireEnv().REGISTRE === "anip" ? registreAnip : registreSimule);
