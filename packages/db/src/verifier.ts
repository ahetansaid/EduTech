import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { tls } from "./index";
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

/** Vérification de la base : comptages, PostGIS, ajout seul, rôle applicatif et RLS. Tout est annulé : rien n'est modifié. */
const s = postgres(process.env.DATABASE_URL_UNPOOLED!, { ssl: tls(process.env.DATABASE_URL_UNPOOLED!), max: 1, onnotice: () => {} });

const [c] = await s`select
  (select count(*) from core.departements)::int dep, (select count(*) from core.communes)::int com,
  (select count(*) from core.etablissements)::int etab, (select count(*) from core.apprenants)::int app,
  (select count(*) from ledger.evenements)::int evt, (select count(*) from analytics.cellules)::int cel,
  (select count(*) from core.certificats)::int cert, (select count(*) from registre_simule.personnes)::int pers`;
console.log("1. Comptages :", c);

const geo = await s`select c.nom commune, d.nom departement
  from core.etablissements e join core.communes c on ST_Contains(c.geom, e.position) join core.departements d on d.id = c.departement_id
  where e.id = 'ETB-PAR-PILOTE-CEG'`;
const [surf] = await s`select nom, round((ST_Area(geom::geography) / 1e6)::numeric) km2 from core.departements order by 2 desc limit 1`;
const [proches] = await s`select count(*)::int n from core.etablissements e, core.etablissements p
  where p.id = 'ETB-PAR-PILOTE-CEG' and e.id <> p.id and ST_DWithin(e.position::geography, p.position::geography, 5000)`;
console.log("2. PostGIS : le CEG pilote est situé dans", geo[0], "· plus grand département :", surf, "·", proches?.n, "établissements à moins de 5 km du CEG pilote");

const essai = async (libelle: string, sql: string) => {
  try { await s.begin(async (tx) => { await tx.unsafe(sql); throw new Error("__annuler__"); }); }
  catch (e) { const m = (e as Error).message; console.log(`   ${libelle} →`, m === "__annuler__" ? "ACCEPTÉ (puis annulé)" : `REFUSÉ : ${m}`); }
};
console.log("3. Registre en ajout seul :");
await essai("UPDATE d'une note au registre", "update ledger.evenements set donnees = '{}'::jsonb where id = (select id from ledger.evenements where type = 'EVALUATION' limit 1)");
await essai("DELETE d'un événement", "delete from ledger.evenements where id = (select id from ledger.evenements limit 1)");
await essai("TRUNCATE du registre", "truncate ledger.evenements");
await essai("TÉMOIN : UPDATE d'une table ordinaire (core.profils)", "update core.profils set fonction = fonction where id = 'p-central'");
console.log("4. Propriétaire neondb_owner (BYPASSRLS, réservé aux migrations) — attendu : accepté :");
await essai("INSERT d'un cas", "insert into sensible.cas (id, categorie, apprenant_id, referent_id, contenu_chiffre, conserver_jusqu_au) values ('CAS-TEST','protection','APP-000001','x','chiffre','2030-01-01')");
const essaiRole = async (libelle: string, sql: string) => {
  try { await s.begin(async (tx) => { await tx.unsafe("set local role beile_app"); const r = await tx.unsafe(sql); console.log(`   ${libelle} → ACCEPTÉ (${r.count ?? r.length} ligne(s), puis annulé)`); throw new Error("__annuler__"); }); }
  catch (e) { const m = (e as Error).message; if (m !== "__annuler__") console.log(`   ${libelle} → REFUSÉ : ${m}`); }
};
console.log("5. Rôle applicatif beile_app (celui de l’API) :");
await essaiRole("TÉMOIN : lecture des apprenants", "select id from core.apprenants limit 5");
await essaiRole("TÉMOIN : ajout d'un événement au registre", "insert into ledger.evenements (id, type, survenu_le, auteur_id, source, donnees) values ('EVT-TEST', 'ABSENCE', now(), 'test', 'beile', '{}')");
await essaiRole("UPDATE du registre", "update ledger.evenements set donnees = '{}' where id = (select id from ledger.evenements limit 1)");
await essaiRole("DELETE dans le journal d'audit", "delete from audit.journal");
await essaiRole("INSERT d'un cas sensible", "insert into sensible.cas (id, categorie, apprenant_id, referent_id, contenu_chiffre, conserver_jusqu_au) values ('CAS-TEST','protection','APP-000001','x','chiffre','2030-01-01')");
await essaiRole("DELETE d'un apprenant", "delete from core.apprenants where id = 'APP-000001'");
await s.end();
