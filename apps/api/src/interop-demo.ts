import { fileURLToPath } from "node:url";
import { connecter } from "@beile/db";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { envoyer } from "./client-interop";
import { Session } from "./client-recette";

/**
 * Démonstration de la couche nationale : quatre systèmes partenaires transmettent leurs faits à BEILE
 * par le connecteur signé, comme ils le feraient via la plateforme nationale d'interopérabilité.
 *   1. EducMaster      → les absences du jour d'une classe de collège ;
 *   2. eRESULTATS      → le PV du CEP d'une session, puis sa publication (BEILE délivre les diplômes) ;
 *   3. l'UAC (SI)      → le PV de la session de rattrapage de la Licence Informatique (IFRI) ;
 *   4. la DBAU         → des décisions d'allocation de l'année.
 * Le script ne lit la base qu'en LECTURE (le référentiel qu'un partenaire connaît déjà : NPI, classes) ;
 * toutes les écritures passent par les connecteurs, donc par le registre et ses contrôles. Rejouable.
 *
 * Prérequis : BEILE_PARTENAIRES (mêmes secrets que l'API), API démarrée, référentiel du supérieur et
 * scénario joués. `npm run interop:demo -w @beile/api`
 */
// Même configuration que les scripts de la base : le `.env` du dépôt (connexion, secrets des partenaires).
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

const exiger = (libelle: string, r: { statut: number; json: unknown }, attendus = [200, 201]) => {
  if (!attendus.includes(r.statut)) { console.error(`✘ ${libelle} — HTTP ${r.statut} : ${JSON.stringify(r.json).slice(0, 300)}`); process.exit(1); }
  return r.json as Record<string, unknown>;
};
const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const lire = async <T>(q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as T[];
const aujourdhui = new Date().toISOString().slice(0, 10);

try {
  /* 1. EducMaster : trois absents du jour dans une classe du CEG pilote. */
  const classe = "CLS-PAR-5eA-S";
  const absents = await lire<{ npi: string }>(sql`select a.npi from core.scolarites s join core.apprenants a on a.id = s.apprenant_id
    where s.classe_id = ${classe} and a.npi is not null order by a.id limit 3`);
  const r1 = exiger("EducMaster → absences", await envoyer("educmaster", "/interop/educmaster/absences", {
    etablissementId: "ETB-PAR-PILOTE-CEG", classeId: classe, date: aujourdhui, absents: absents.map((x) => x.npi),
  }, { lot: `EDM-ABS-${aujourdhui}-${classe.slice(4, 12)}` }));
  console.log(`1. EducMaster : ${r1.deja ? "lot déjà reçu" : `${r1.enregistres} absence(s) inscrite(s)`} (source « educmaster », familles notifiées).`);

  /* 2. eRESULTATS : le bureau BEILE constitue le candidaturé ; l'autorité transmet le PV puis publie. */
  const central = new Session();
  const identifiant = "felicite.akakpo";
  exiger("Connexion du bureau", await central.connexion(identifiant));
  const libelle = "Juin 2026";
  const sessions = (await central.appel("GET", "/examens/sessions")).json as unknown as { id: string; examen: string; session: string; statut: string }[];
  let session = sessions.find((s) => s.examen === "CEP" && s.session === libelle);
  if (!session) {
    const ouverte = exiger("Ouverture de la session CEP", await central.appel("POST", "/examens/sessions", { examen: "CEP", session: libelle }));
    session = { id: String(ouverte.id), examen: "CEP", session: libelle, statut: "ouverte" };
  }
  if (session.statut !== "publiee") {
    const centres = (await central.appel("GET", "/examens/centres")).json as unknown as { id: string }[];
    exiger("Candidaturé CM2", await central.appel("POST", `/examens/sessions/${session.id}/candidatures`, { etablissementId: "ETB-PAR-PILOTE-EPP", centreId: centres[0]!.id }), [201, 409, 422]);
    const tables = ((await central.appel("GET", `/examens/sessions/${session.id}/candidatures`)).json as unknown as { numeroTable: string }[]).map((x) => x.numeroTable);
    // Le PV officiel : verdicts du jury, dont un absent — jamais recalculés par BEILE.
    const decisions = tables.map((t, i) => (i === tables.length - 1 && tables.length > 2
      ? { numeroTable: t, decision: "absent", moyenne: null }
      : { numeroTable: t, decision: i % 5 === 3 ? "non_admis" : "admis", moyenne: i % 5 === 3 ? 8.5 : 11 + (i % 7) }));
    const pv = exiger("eRESULTATS → PV du CEP", await envoyer("eresultats", "/interop/eresultats/pv-examen", { examen: "CEP", session: libelle, pvReference: `PV-DEC-MEMP-CEP-${libelle.replace(/\s/g, "")}`, decisions }));
    const pub = exiger("eRESULTATS → publication", await envoyer("eresultats", "/interop/eresultats/publication", { examen: "CEP", session: libelle }));
    console.log(`2. eRESULTATS : ${pv.recus} verdict(s) reçus, session publiée — ${pub.diplomes} CEP délivré(s) au nom de la ${pub.autorite}.`);
  } else console.log("2. eRESULTATS : session déjà publiée.");

  /* 3. UAC : PV de la session de rattrapage — les ajournés de la licence 2025-2026, désormais admis. */
  const ajournes = await lire<{ npi: string }>(sql`select a.npi from core.deliberations_diplome d join core.apprenants a on a.id = d.apprenant_id
    where d.filiere_id = 'FIL-UAC-IFRI-L-INFO' and d.decision = 'ajourne' and a.npi is not null
      and not exists (select 1 from core.certificats c where c.apprenant_id = d.apprenant_id and c.examen = 'LICENCE') order by a.npi`);
  if (ajournes.length) {
    const r3 = exiger("UAC → PV de rattrapage", await envoyer("uac", "/interop/uac/pv-diplome", {
      pvReference: "PV-IFRI-LIC-2026-RATTRAPAGE", filiereId: "FIL-UAC-IFRI-L-INFO", anneeUniversitaire: "2025-2026",
      decisions: ajournes.map((x, i) => (i === 0 ? { npi: x.npi, decision: "ajourne", creditsValides: 150, moyenne: 9.1 } : { npi: x.npi, decision: "admis", creditsValides: 180, moyenne: 10.5 + i / 2 })),
    }));
    console.log(`3. UAC : ${(r3.certifies as unknown[]).length} licence(s) certifiée(s) sur PV de rattrapage, ${r3.ajournes} ajourné(s), ${(r3.rejets as unknown[]).length} rejet(s).`);
  } else console.log("3. UAC : aucun ajourné en attente.");

  /* 4. DBAU : décisions d'allocation de l'année pour la promotion de L1. */
  const l1 = await lire<{ npi: string }>(sql`select a.npi from core.inscriptions_superieures i join core.apprenants a on a.id = i.apprenant_id
    where i.filiere_id = 'FIL-UAC-IFRI-L-INFO' and i.annee_universitaire = '2026-2027' and i.composante = 'L1' and a.npi is not null order by a.npi limit 6`);
  const r4 = exiger("DBAU → allocations", await envoyer("dbau", "/interop/dbau/allocations", {
    anneeUniversitaire: "2026-2027",
    decisions: l1.map((x, i) => ({ npi: x.npi, typeDecision: "attribution", statutCompte: i % 2 ? "demi_boursier" : "boursier_integral", referenceActe: "Arrêté DBAU 2026-0917 (démonstration)", decideLe: "2026-09-26" })),
  }, { lot: "DBAU-ALLOC-2026-2027-L1-IFRI" }));
  console.log(`4. DBAU : ${r4.deja ? "lot déjà reçu" : `${r4.enregistres} décision(s) d'allocation inscrite(s)`}.`);
  console.log("\nCouche nationale : quatre systèmes raccordés, faits reçus, contrôlés, rattachés au NPI et scellés.");
} finally {
  await client.end();
}
