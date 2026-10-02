import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import postgres from "postgres";
import { tls } from "./index";
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

/**
 * Vérification de la base : comptages, PostGIS, ajout seul, rôle applicatif, rôle du portail public, RLS,
 * diplômes et résultats publiés immuables. Chaque essai a un résultat ATTENDU ; tout écart fait échouer le
 * script (et l'intégration continue). Tout est annulé : rien n'est modifié.
 */
const s = postgres(process.env.DATABASE_URL_UNPOOLED!, { ssl: tls(process.env.DATABASE_URL_UNPOOLED!), max: 1, onnotice: () => {} });
let ecarts = 0;

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

type Attendu = "accepte" | "refuse";
const constater = (libelle: string, attendu: Attendu, obtenu: Attendu, detail: string) => {
  const ok = attendu === obtenu;
  if (!ok) ecarts++;
  console.log(`   ${ok ? "✔" : "✘"} ${libelle} → ${obtenu === "accepte" ? "ACCEPTÉ" : "REFUSÉ"}${detail ? ` (${detail})` : ""}${ok ? "" : ` — attendu ${attendu === "accepte" ? "ACCEPTÉ" : "REFUSÉ"}`}`);
};
/** Exécute en transaction annulée, éventuellement sous un rôle (SET LOCAL ROLE). */
const essai = async (libelle: string, attendu: Attendu, sql: string, role?: string) => {
  try {
    await s.begin(async (tx) => {
      if (role) await tx.unsafe(`set local role ${role}`);
      const r = await tx.unsafe(sql);
      constater(libelle, attendu, "accepte", `${r.count ?? r.length} ligne(s), puis annulé`);
      throw new Error("__annuler__");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m !== "__annuler__") constater(libelle, attendu, "refuse", m.slice(0, 90));
  }
};

console.log("3. Registre en ajout seul (propriétaire compris) :");
await essai("UPDATE d'une note au registre", "refuse", "update ledger.evenements set donnees = '{}'::jsonb where id = (select id from ledger.evenements where type = 'EVALUATION' limit 1)");
await essai("DELETE d'un événement", "refuse", "delete from ledger.evenements where id = (select id from ledger.evenements limit 1)");
await essai("TRUNCATE du registre", "refuse", "truncate ledger.evenements");
await essai("TRUNCATE des décisions de circuit", "refuse", "truncate workflow.decisions");
await essai("TÉMOIN : UPDATE d'une table ordinaire (core.profils)", "accepte", "update core.profils set fonction = fonction where id = 'p-central'");

console.log("4. Propriétaire (BYPASSRLS, réservé aux migrations) :");
await essai("INSERT d'un cas sensible", "accepte", "insert into sensible.cas (id, categorie, apprenant_id, referent_id, contenu_chiffre, conserver_jusqu_au) values ('CAS-TEST','protection','APP-000001','x','chiffre','2030-01-01')");

console.log("5. Rôle applicatif beile_app (celui de l'API) :");
await essai("TÉMOIN : lecture des apprenants", "accepte", "select id from core.apprenants limit 5", "beile_app");
await essai("TÉMOIN : ajout d'un événement au registre", "accepte", "insert into ledger.evenements (id, type, survenu_le, auteur_id, source, donnees) values ('EVT-TEST', 'ABSENCE', now(), 'test', 'beile', '{}')", "beile_app");
await essai("UPDATE du registre", "refuse", "update ledger.evenements set donnees = '{}' where id = (select id from ledger.evenements limit 1)", "beile_app");
await essai("DELETE dans le journal d'audit", "refuse", "delete from audit.journal", "beile_app");
await essai("INSERT d'un cas sensible (RLS)", "refuse", "insert into sensible.cas (id, categorie, apprenant_id, referent_id, contenu_chiffre, conserver_jusqu_au) values ('CAS-TEST','protection','APP-000001','x','chiffre','2030-01-01')", "beile_app");
await essai("DELETE d'un apprenant", "refuse", "delete from core.apprenants where id = 'APP-000001'", "beile_app");
await essai("Écriture dans l'arbre des organisations", "refuse", "update core.organisations set nom = nom where id = 'ORG-AUTORITE'", "beile_app");

console.log("6. Diplômes immuables (déclencheur en base, y compris pour le propriétaire) :");
const cert = "(select id from core.certificats order by id limit 1)";
await essai("TÉMOIN : révoquer un diplôme (seule transition admise)", "accepte", `update core.certificats set revoque = true where id = ${cert}`);
await essai("Modifier la mention d'un diplôme émis", "refuse", `update core.certificats set mention = case when mention = 'Passable' then 'Bien' else 'Passable' end where id = ${cert}`);
await essai("Annuler une révocation", "refuse", `update core.certificats set revoque = true where id = ${cert}; update core.certificats set revoque = false where id = ${cert}`);
await essai("Supprimer un diplôme", "refuse", `delete from core.certificats where id = ${cert}`);

console.log("7. Résultats d'examens publiés immuables :");
const [publiee] = await s`select k.id from core.examens_candidatures k join core.examens_sessions x on x.id = k.session_id where x.statut = 'publiee' and k.decision is not null limit 1`;
if (publiee) {
  await essai("Changer le verdict d'un candidat d'une session publiée", "refuse", `update core.examens_candidatures set decision = case when decision = 'admis' then 'ajourne' else 'admis' end where id = '${publiee.id}'`);
  await essai("Dépublier une session", "refuse", `update core.examens_sessions set statut = 'deliberee' where id = (select session_id from core.examens_candidatures where id = '${publiee.id}')`);
  await essai("TÉMOIN : relire le verdict", "accepte", `select decision from core.examens_candidatures where id = '${publiee.id}'`, "beile_app");
} else console.log("   (aucune session publiée : cas ignorés)");

console.log("8. Rôle du portail public (données publiques seulement) :");
const [rolePublic] = await s`select 1 from pg_roles where rolname = 'beile_portail_public'`;
if (rolePublic) {
  await essai("TÉMOIN : annuaire public", "accepte", "select id from core.referentiel_etablissements limit 1", "beile_portail_public");
  await essai("TÉMOIN : nom d'un apprenant (vérification de diplôme)", "accepte", "select prenoms, nom from core.apprenants limit 1", "beile_portail_public");
  await essai("NPI d'un apprenant", "refuse", "select npi from core.apprenants limit 1", "beile_portail_public");
  await essai("Comptes et mots de passe", "refuse", "select mot_de_passe_hash from core.comptes limit 1", "beile_portail_public");
  await essai("Notes au registre", "refuse", "select donnees from ledger.evenements limit 1", "beile_portail_public");
  await essai("Lecture du journal d'audit", "refuse", "select * from audit.journal limit 1", "beile_portail_public");
} else console.log("   (rôle absent : cas ignorés)");

await s.end();
console.log(ecarts ? `\n✘ ${ecarts} écart(s) avec l'attendu` : "\n✔ Base conforme à l'attendu");
process.exit(ecarts ? 1 : 0);
