import { fileURLToPath } from "node:url";
import { ExamenNational, NIVEAUX } from "@beile/contracts";
import { ANNEES, genererCoucheNationale } from "@beile/simulation/macro";
import { genererMicroMonde } from "@beile/simulation/micro";
import { COMMUNES_GEO } from "@beile/simulation/territoire";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";
import { chargerConfiguration, chargerTerritoire } from "./socle";
import * as t from "./schema";

/**
 * Peuplement de démonstration : charge les données FICTIVES du moteur de simulation.
 * Idempotent sur une base vide (à lancer après `migrer`). Ne jamais pointer vers une base de production.
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
if (process.env.BEILE_ENV === "production") throw new Error("Peuplement fictif interdit en production.");

const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);

async function parLots<T>(lignes: T[], taille: number, inserer: (lot: T[]) => Promise<unknown>) {
  for (let i = 0; i < lignes.length; i += taille) await inserer(lignes.slice(i, i + taille));
}
const typeInstitution = (nom: string, cycle: "primaire" | "secondaire") =>
  cycle === "primaire" ? ("ecole_primaire" as const) : nom.startsWith("Lycée") ? ("lycee_general" as const) : ("college" as const);

try {
  const debut = Date.now();
  const couches = genererCoucheNationale();
  const monde = genererMicroMonde();
  const deja = await db.select({ n: sql<number>`count(*)::int` }).from(t.departements);
  if ((deja[0]?.n ?? 0) > 0) throw new Error("Base déjà peuplée : repartir d'une branche Neon vierge.");

  await db.transaction(async (tx) => {
    // Territoire (socle commun)
    await chargerTerritoire(tx);

    // Établissements (national + pilotes)
    const etabs = [...couches.etablissements, ...monde.etablissements];
    await parLots(etabs, 500, (lot) => tx.insert(t.etablissements).values(lot.map((e) => ({
      id: e.id, nom: e.nom, typeInstitution: typeInstitution(e.nom, e.cycle), ministereTutelle: e.cycle === "primaire" ? ("MEMP" as const) : ("MESTFP" as const),
      cycle: e.cycle, statut: e.statut, communeId: e.communeId, circonscription: e.circonscription,
      position: sql`ST_SetSRID(ST_MakePoint(${e.lng}, ${e.lat}), 4326)` as unknown as string,
      capacite: e.capacite, sallesDeClasse: e.sallesDeClasse, infrastructures: e.infrastructures,
      effectifDeclare: e.effectif, enseignantsDeclares: e.enseignants, transmis: e.transmis, pilote: e.id.includes("PILOTE"),
    }))));

    // Personnes et scolarité (établissements pilotes)
    await parLots(monde.registre, 500, (lot) => tx.insert(t.personnes).values(lot.map((p) => ({ ...p }))));
    await tx.insert(t.apprenants).values(monde.apprenants);
    await tx.insert(t.enseignants).values(monde.enseignants);
    await tx.insert(t.affectations).values(monde.enseignants.map((e) => ({ id: `AFF-${e.id}`, enseignantId: e.id, etablissementId: e.etablissementId, fonction: "Enseignant", valideDu: "2024-09-15" })));
    await tx.insert(t.classes).values(monde.classes);
    await tx.insert(t.enseignements).values(monde.enseignements);
    await tx.insert(t.liensFamiliaux).values(monde.liens);
    await tx.insert(t.parcours).values(monde.apprenants.map((a) => ({ id: `PRC-${a.id}`, apprenantId: a.id, type: "scolaire" as const, intitule: "Scolarité de base", statut: "en_cours" as const, valideDu: "2019-10-01" })));
    await tx.insert(t.certificats).values(monde.certificats);
    await tx.insert(t.profils).values(monde.profils);

    // Registre d'événements
    await parLots(monde.evenements, 1000, (lot) => tx.insert(t.evenements).values(lot.map((e) => {
      const { id, type, survenuLe, enregistreLe, auteurId, source, etablissementId, ...donnees } = e;
      return {
        id, type, survenuLe: new Date(survenuLe), enregistreLe: new Date(enregistreLe), auteurId, source, etablissementId,
        apprenantId: "apprenantId" in e ? e.apprenantId : null,
        enseignantId: "enseignantId" in e ? e.enseignantId : null,
        donnees,
      };
    })));

    // Cube statistique national
    const cellules: (typeof t.cellules.$inferInsert)[] = [];
    const parAnnee: (typeof t.communesAnnee.$inferInsert)[] = [];
    for (const c of couches.communes.values()) {
      for (const annee of ANNEES) {
        const a = c.annees[annee];
        for (const niveau of NIVEAUX) for (const sexe of ["F", "M"] as const) {
          const cell = a.niveaux[niveau];
          cellules.push({ communeId: c.communeId, annee, niveau, sexe, effectif: sexe === "F" ? cell.effectifF : cell.effectifM, moyMaths: cell.notes.Mathématiques[sexe].moy, etMaths: cell.notes.Mathématiques[sexe].et, moyFrancais: cell.notes.Français[sexe].moy, etFrancais: cell.notes.Français[sexe].et });
        }
        parAnnee.push({ communeId: c.communeId, annee, capacite: a.capacite, enseignants: a.enseignants, enseignantsQualifies: a.enseignantsQualifies, tauxAbsenteisme: a.tauxAbsenteisme, tauxAbandon: a.tauxAbandon, populationScolarisable: a.populationScolarisable, couverture: a.couverture, fraicheurJours: a.fraicheurJours, examens: c.examens[annee] });
      }
    }
    await parLots(cellules, 2000, (lot) => tx.insert(t.cellules).values(lot));
    await tx.insert(t.communesAnnee).values(parAnnee);

    // Référentiels du moteur de compétences, circuits de workflow, gouvernance
    await tx.insert(t.competences).values([
      { id: "MATH-CALC", matiere: "Mathématiques", domaine: "Nombres", libelle: "Calcul et opérations", niveaux: ["6e", "5e", "4e", "3e"], version: "1.0" },
      { id: "MATH-FRAC", matiere: "Mathématiques", domaine: "Nombres", libelle: "Fractions et proportionnalité", niveaux: ["6e", "5e"], version: "1.0" },
      { id: "MATH-GEOM", matiere: "Mathématiques", domaine: "Géométrie", libelle: "Figures et mesures", niveaux: ["6e", "5e", "4e", "3e"], version: "1.0" },
      { id: "MATH-RAIS", matiere: "Mathématiques", domaine: "Raisonnement", libelle: "Résolution de problèmes", niveaux: ["6e", "5e", "4e", "3e"], version: "1.0" },
      { id: "FR-LECT", matiere: "Français", domaine: "Lecture", libelle: "Compréhension de texte", niveaux: ["6e", "5e", "4e", "3e"], version: "1.0" },
      { id: "FR-ECR", matiere: "Français", domaine: "Écriture", libelle: "Production écrite", niveaux: ["6e", "5e", "4e", "3e"], version: "1.0" },
    ]);
    await chargerConfiguration(tx);

    /* ------------------------------------------------------------------ Examens nationaux (e-résultat)
       Sessions publiées, centres et candidatures dérivés des diplômes déjà délivrés : la recherche
       publique par numéro de table répond ainsi en cohérence avec le registre des certificats. */
    const communesExam = [...new Set(monde.etablissements.map((e) => e.communeId))].filter(Boolean);
    const centres = (communesExam.length ? communesExam : COMMUNES_GEO.features.slice(0, 4).map((f) => f.properties.id)).slice(0, 6)
      .map((communeId, i) => ({ id: `CEN-EXAM-${i + 1}`, nom: `Centre d'examen ${i + 1}`, communeId, capacite: 300 }));
    await tx.insert(t.examensCentres).values(centres);

    const sessId = (examen: string, session: string) => `SES-EXAM-${examen}-${session.replace(/\s+/g, "-")}`;
    const anneeDe = (session: string) => session.match(/\d{4}/)?.[0] ?? "";
    // Une session « publiee » par (examen, session) rencontré parmi les diplômes.
    // Le monde simulé ne délivre que des examens nationaux ; le doctorat, diplôme d'établissement, n'a pas de session.
    const groupes = [...new Map(monde.certificats.filter((c): c is typeof c & { examen: ExamenNational } => ExamenNational.safeParse(c.examen).success)
      .map((c) => [`${c.examen}|${c.session}`, c])).values()];
    const sessions = groupes.map((c) => ({ id: sessId(c.examen, c.session), examen: c.examen, session: c.session, statut: "publiee" as const, publieeLe: `${anneeDe(c.session)}-07-20`, arretCandidatures: null }));
    await tx.insert(t.examensSessions).values(sessions);

    const rangs = new Map<string, number>();
    const tableDe = (sid: string, annee: string) => { const n = (rangs.get(sid) ?? 0) + 1; rangs.set(sid, n); return `${annee}${String(n).padStart(6, "0")}`; };
    // Chaque admis reçoit un numéro de table ; les verdicts reprennent ceux du diplôme.
    const candidatures: (typeof t.examensCandidatures.$inferInsert)[] = monde.certificats.map((c, i) => {
      const sid = sessId(c.examen, c.session);
      return { id: `CAN-${c.id}`, sessionId: sid, apprenantId: c.apprenantId, centreId: centres[i % centres.length]!.id, numeroTable: tableDe(sid, anneeDe(c.session)), decision: "admis" as const, moyenne: c.moyenne, mention: c.mention };
    });
    // Quelques ajournés (admis jamais diplômés) dans la session la plus récente, pour rendre le verdict « non admis » testable.
    const diplomes = new Set(monde.certificats.map((c) => c.apprenantId));
    const sansDiplome = monde.apprenants.filter((a) => !diplomes.has(a.id));
    const recente = [...sessions].sort((a, b) => b.session.localeCompare(a.session))[0];
    if (recente && sansDiplome.length) {
      const annee = anneeDe(recente.session);
      for (const a of sansDiplome.slice(0, Math.min(sansDiplome.length, 25))) {
        const i = candidatures.length;
        candidatures.push({ id: `CAN-AJ-${a.id}`, sessionId: recente.id, apprenantId: a.id, centreId: centres[i % centres.length]!.id, numeroTable: tableDe(recente.id, annee), decision: "non_admis" as const, moyenne: Number((6 + (i % 4) * 0.9 + 0.25).toFixed(2)), mention: null });
      }
    }
    await parLots(candidatures, 500, (lot) => tx.insert(t.examensCandidatures).values(lot));
  });

  console.log(`Peuplement terminé en ${((Date.now() - debut) / 1000).toFixed(1)} s.`);
} finally {
  await client.end();
}
