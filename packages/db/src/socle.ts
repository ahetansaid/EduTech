import { COMMUNES_GEO, DEPARTEMENTS_GEO } from "@beile/simulation/territoire";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import * as t from "./schema";

/**
 * Socle commun à toute base BEILE, réelle ou de démonstration :
 * - le territoire (12 départements, 77 communes, contours officiels) ;
 * - la configuration (modèles de circuits, catalogue de gouvernance des données).
 * Aucune donnée de personne ni d'établissement ici.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = PgTransaction<any, typeof t, any>;
const multi = (g: unknown) => sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(g)}), 4326))`;

export async function chargerTerritoire(tx: Tx) {
  await tx.insert(t.departements).values(DEPARTEMENTS_GEO.features.map((f) => ({ id: f.properties.id, nom: f.properties.nom, chefLieu: f.properties.chefLieu, geom: multi(f.geometry) as unknown as string })));
  await tx.insert(t.communes).values(COMMUNES_GEO.features.map((f) => ({ id: f.properties.id, nom: f.properties.nom, departementId: f.properties.departementId, milieu: f.properties.milieu, geom: multi(f.geometry) as unknown as string })));
}

export async function chargerConfiguration(tx: Tx) {
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
}
