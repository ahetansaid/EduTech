import { fileURLToPath } from "node:url";
import { NIVEAUX } from "@beile/contracts";
import { ANNEES, genererCoucheNationale } from "@beile/simulation/macro";
import { genererMicroMonde } from "@beile/simulation/micro";
import { COMMUNES_GEO, DEPARTEMENTS_GEO } from "@beile/simulation/territoire";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";
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
const multi = (g: unknown) => sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}), 4326))`;
const typeInstitution = (nom: string, cycle: "primaire" | "secondaire") =>
  cycle === "primaire" ? ("ecole_primaire" as const) : nom.startsWith("Lycée") ? ("lycee_general" as const) : ("college" as const);

try {
  const debut = Date.now();
  const couches = genererCoucheNationale();
  const monde = genererMicroMonde();
  const deja = await db.select({ n: sql<number>`count(*)::int` }).from(t.departements);
  if ((deja[0]?.n ?? 0) > 0) throw new Error("Base déjà peuplée : repartir d'une branche Neon vierge.");

  await db.transaction(async (tx) => {
    // Territoire
    await tx.insert(t.departements).values(DEPARTEMENTS_GEO.features.map((f) => ({ id: f.properties.id, nom: f.properties.nom, chefLieu: f.properties.chefLieu, geom: multi(f.geometry) as unknown as string })));
    await tx.insert(t.communes).values(COMMUNES_GEO.features.map((f) => ({ id: f.properties.id, nom: f.properties.nom, departementId: f.properties.departementId, milieu: f.properties.milieu, geom: multi(f.geometry) as unknown as string })));

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
    await tx.insert(t.modelesCircuit).values([
      { code: "TRANSFERT", libelle: "Transfert d'établissement", version: "1.0", etapes: [{ ordre: 1, code: "DEMANDE", role: "parent", delaiJours: 0 }, { ordre: 2, code: "ACCORD_ACCUEIL", role: "chef_etablissement", delaiJours: 5 }, { ordre: 3, code: "VISA_DEPART", role: "chef_etablissement", delaiJours: 3 }] },
      { code: "RECLAMATION", libelle: "Réclamation sur une donnée", version: "1.0", etapes: [{ ordre: 1, code: "DEPOT", role: "apprenant", delaiJours: 0 }, { ordre: 2, code: "INSTRUCTION", role: "chef_etablissement", delaiJours: 7 }, { ordre: 3, code: "CORRECTION", role: "direction_departementale", delaiJours: 10 }] },
      { code: "AFFECTATION", libelle: "Affectation d'un enseignant", version: "1.0", etapes: [{ ordre: 1, code: "BESOIN", role: "direction_departementale", delaiJours: 0 }, { ordre: 2, code: "PROPOSITION", role: "administration_centrale", delaiJours: 15 }, { ordre: 3, code: "PRISE_FONCTION", role: "chef_etablissement", delaiJours: 30 }] },
    ]);
    await tx.insert(t.elementsDonnees).values([
      { code: "apprenant.date_naissance", definition: "Date de naissance de l'apprenant", proprietaire: "ANIP", gestionnaire: "Direction de l'état civil", sourceReference: "Registre national des personnes physiques", regleQualite: "Date antérieure à l'inscription ; âge compatible avec le niveau (écart ≤ 5 ans)", politiqueAcces: "Rôle + périmètre + relation", sensibilite: 3, conservation: "Durée de la scolarité + 10 ans", finalite: "Identification, statistiques par âge", frequence: "À la naissance, rectification encadrée", version: "1.0" },
      { code: "etablissement.capacite", definition: "Nombre de places d'accueil déclarées", proprietaire: "MEMP / MESTFP", gestionnaire: "Direction de la programmation", sourceReference: "Référentiel des établissements BEILE", regleQualite: "Capacité > 0 ; cohérente avec le nombre de salles (≤ 70 places par salle)", politiqueAcces: "Public (agrégé)", sensibilite: 1, conservation: "Historisée", finalite: "Carte scolaire, planification", frequence: "Annuelle et à chaque travaux", version: "1.0" },
      { code: "evaluation.note", definition: "Note obtenue à une évaluation", proprietaire: "Établissement", gestionnaire: "Enseignant de la matière", sourceReference: "Registre des événements BEILE", regleQualite: "0 ≤ note ≤ 20, au quart de point ; corrections tracées", politiqueAcces: "Relation pédagogique ou filiation", sensibilite: 3, conservation: "Durée de la scolarité + 5 ans", finalite: "Suivi pédagogique, bulletins, statistiques agrégées", frequence: "Continue", version: "1.0" },
    ]);
  });

  console.log(`Peuplement terminé en ${((Date.now() - debut) / 1000).toFixed(1)} s.`);
} finally {
  await client.end();
}
