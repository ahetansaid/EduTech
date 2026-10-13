import { communesDuPerimetre } from "@beile/simulation/semantique";
import { aujourdhui } from "@beile/simulation/scolarite";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, cleUtilisateur, journaliser, limiteDebit, type Variables } from "./commun";
import { etablissementsDuPerimetre, habilitation } from "./visites";

/**
 * Rapport mensuel de la tutelle : ce qui s'est fait sur le terrain pendant un mois, sous le périmètre de
 * l'habilitation de tutelle (inspection, direction départementale, administration centrale). Tout vient du
 * REGISTRE réel et des circuits — jamais du cube statistique de démonstration : c'est le compte rendu
 * d'activité qu'une direction remonte, pas un indicateur de résultat scolaire.
 *
 * Aucune donnée nominative : des nombres d'établissements, de faits, de demandes.
 */
export const rapports = new Hono<{ Variables: Variables }>();

const MOIS = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mois attendu au format AAAA-MM");

rapports.get("/rapports/mensuel", authentifie, limiteDebit(20, 60_000, cleUtilisateur), async (c) => {
  const profil = c.get("profil");
  const perimetre = await habilitation(profil);
  const jour = aujourdhui();
  const mois = MOIS.catch(jour.slice(0, 7)).parse(c.req.query("mois"));
  if (mois > jour.slice(0, 7)) throw new HTTPException(422, { message: "Un rapport ne porte pas sur un mois à venir" });
  const debut = `${mois}-01`;
  const [a, m] = mois.split("-").map(Number) as [number, number];
  const fin = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;

  const dansPerimetre = etablissementsDuPerimetre(perimetre);
  const etabs = dansPerimetre ? sql`(${dansPerimetre})` : sql`(select id from core.etablissements)`;
  const autorisees = communesDuPerimetre(perimetre);
  const communes = autorisees ? sql`(select jsonb_array_elements_text(${JSON.stringify([...autorisees])}::jsonb))` : null;

  const [[etablissements], [visites], [appel], [notes], [relances], [suivis]] = await Promise.all([
    base().execute<{ attendus: number; transmis: number }>(sql`
      select count(*)::int as attendus, count(*) filter (where transmis)::int as transmis from core.etablissements where id in ${etabs}`),
    base().execute<{ visites: number; ecoles: number; jamais: number }>(sql`
      select
        (select count(*)::int from ledger.evenements where type = 'VISITE_D_INSPECTION' and etablissement_id in ${etabs}
           and donnees->>'dateVisite' >= ${debut} and donnees->>'dateVisite' < ${fin}) as visites,
        (select count(distinct etablissement_id)::int from ledger.evenements where type = 'VISITE_D_INSPECTION' and etablissement_id in ${etabs}
           and donnees->>'dateVisite' >= ${debut} and donnees->>'dateVisite' < ${fin}) as ecoles,
        (select count(*)::int from core.etablissements t where t.id in ${etabs}
           and not exists (select 1 from ledger.evenements e where e.type = 'VISITE_D_INSPECTION' and e.etablissement_id = t.id and e.donnees->>'dateVisite' < ${fin})) as jamais`),
    base().execute<{ absences: number; ecoles: number; jours: number }>(sql`
      select count(*)::int as absences, count(distinct etablissement_id)::int as ecoles, count(distinct donnees->>'date')::int as jours
      from ledger.evenements where type = 'ABSENCE' and etablissement_id in ${etabs} and donnees->>'date' >= ${debut} and donnees->>'date' < ${fin}`),
    base().execute<{ notes: number; ecoles: number }>(sql`
      select count(*)::int as notes, count(distinct etablissement_id)::int as ecoles
      from ledger.evenements where type = 'EVALUATION' and etablissement_id in ${etabs} and survenu_le >= ${debut}::date and survenu_le < ${fin}::date`),
    base().execute<{ envoyees: number; abouties: number; echues: number }>(sql`
      select count(*) filter (where creee_le >= ${debut}::date and creee_le < ${fin}::date)::int as envoyees,
             count(*) filter (where statut = 'acceptee' and creee_le < ${fin}::date)::int as abouties,
             count(*) filter (where statut in ('ouverte', 'en_cours') and echeance < ${fin}::date)::int as echues
      from workflow.demandes where modele = 'RELANCE_TRANSMISSION' and ressource in ${etabs}`),
    base().execute<{ prises: number; traitees: number; sans_suite: number; en_retard: number }>(sql`
      select count(*) filter (where creee_le >= ${debut}::date and creee_le < ${fin}::date)::int as prises,
             count(*) filter (where statut = 'acceptee')::int as traitees,
             count(*) filter (where statut = 'refusee')::int as sans_suite,
             count(*) filter (where statut in ('ouverte', 'en_cours') and echeance < now())::int as en_retard
      from workflow.demandes where modele = 'SUIVI_ALERTE' ${communes ? sql`and donnees->>'communeId' in ${communes}` : sql``}`),
  ]);

  await journaliser(profil, "Rapport mensuel de la tutelle", `${mois} · ${perimetre.niveau}`, "controle", true, null);
  return c.json({
    mois, du: debut, au: fin, genereLe: new Date().toISOString(), perimetre,
    source: "registre",
    etablissements: { attendus: etablissements?.attendus ?? 0, transmis: etablissements?.transmis ?? 0 },
    visites: { consignees: visites?.visites ?? 0, ecolesVisitees: visites?.ecoles ?? 0, jamaisVisitees: visites?.jamais ?? 0 },
    appel: { absencesEnregistrees: appel?.absences ?? 0, ecolesAyantFaitLAppel: appel?.ecoles ?? 0, joursDAppel: appel?.jours ?? 0 },
    evaluations: { notesSaisies: notes?.notes ?? 0, ecolesAyantNote: notes?.ecoles ?? 0 },
    relances: { envoyees: relances?.envoyees ?? 0, abouties: relances?.abouties ?? 0, echuesSansReponse: relances?.echues ?? 0 },
    alertes: { prisesEnCharge: suivis?.prises ?? 0, traitees: suivis?.traitees ?? 0, closesSansSuite: suivis?.sans_suite ?? 0, enRetard: suivis?.en_retard ?? 0 },
  });
});
