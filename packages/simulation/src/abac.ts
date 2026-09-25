import type { DecisionAcces, EvaluationCritere, Evenement, Finalite, Habilitation, Profil, Role } from "@beile/contracts";
import { FINALITE_LIBELLE } from "@beile/contracts";
import type { MicroMonde } from "./micro";
import { situationApprenant } from "./projections";
import { communeById } from "./territoire";

/**
 * Moteur de décision d'accès : rôle + périmètre + relation + finalité (document de cadrage §10).
 * Il ne s'agit pas d'un filtre d'affichage : chaque lecture de donnée individuelle passe par
 * `decider`, et chaque décision (accordée ou refusée) est journalisée par l'appelant.
 */

export type Ressource =
  | { type: "dossier_apprenant"; apprenantId: string }
  | { type: "indicateur"; departementId?: string; communeId?: string; etablissementId?: string }
  | { type: "journal_audit" };

export interface Demande {
  ressource: Ressource;
  finalite: Finalite;
}

/** Finalités admises pour chaque rôle et chaque type de ressource. */
const FINALITES: Record<Role, Partial<Record<Ressource["type"], Finalite[]>>> = {
  apprenant: { dossier_apprenant: ["consultation_personnelle"] },
  parent: { dossier_apprenant: ["suivi_familial"] },
  enseignant: { dossier_apprenant: ["evaluation"], indicateur: ["gestion"] },
  chef_etablissement: { dossier_apprenant: ["gestion"], indicateur: ["gestion"] },
  inspecteur: { indicateur: ["controle", "statistique"] },
  direction_departementale: { indicateur: ["gestion", "controle", "statistique"] },
  administration_centrale: { indicateur: ["gestion", "controle", "statistique"] },
  chercheur: { indicateur: ["statistique"] },
  dpo: { journal_audit: ["audit"] },
  // L'administrateur gère les comptes ; il n'a accès à aucune donnée éducative.
  administrateur: {},
};

const ROLE_LIBELLE: Record<Role, string> = {
  apprenant: "apprenant", parent: "parent", enseignant: "enseignant", chef_etablissement: "chef d'établissement",
  inspecteur: "inspecteur", direction_departementale: "direction départementale", administration_centrale: "administration centrale",
  chercheur: "chercheur", dpo: "délégué à la protection des données", administrateur: "administrateur de la plateforme",
};

interface Contexte {
  monde: MicroMonde;
  evenements: Evenement[];
}

function evaluerHabilitation(profil: Profil, h: Habilitation, d: Demande, ctx: Contexte): EvaluationCritere[] {
  const { monde, evenements } = ctx;
  const res = d.ressource;
  const finalitesAdmises = FINALITES[h.role][res.type];
  const role: EvaluationCritere = {
    critere: "role",
    satisfait: !!finalitesAdmises,
    detail: finalitesAdmises ? `Le rôle « ${ROLE_LIBELLE[h.role]} » donne accès à ce type de ressource` : `Le rôle « ${ROLE_LIBELLE[h.role]} » ne donne pas accès à ce type de ressource`,
  };
  const finalite: EvaluationCritere = {
    critere: "finalite",
    satisfait: !!finalitesAdmises?.includes(d.finalite),
    detail: finalitesAdmises?.includes(d.finalite)
      ? `Finalité « ${FINALITE_LIBELLE[d.finalite]} » admise pour ce rôle`
      : `Finalité « ${FINALITE_LIBELLE[d.finalite]} » non admise pour ce rôle`,
  };

  let perimetre: EvaluationCritere;
  let relation: EvaluationCritere;

  if (res.type === "dossier_apprenant") {
    const situation = situationApprenant(monde, evenements, res.apprenantId);
    const p = h.perimetre;
    const dansPerimetre =
      p.niveau === "national" ? true
        : p.niveau === "personnel" ? p.apprenantId === res.apprenantId
        : p.niveau === "famille" ? true
        : p.niveau === "etablissement" ? situation.etablissementId === p.etablissementId
        : false;
    perimetre = { critere: "perimetre", satisfait: dansPerimetre, detail: dansPerimetre ? "Le dossier relève du périmètre de l'habilitation" : "Le dossier est hors du périmètre de l'habilitation" };

    if (h.role === "apprenant") {
      relation = { critere: "relation", satisfait: p.niveau === "personnel" && p.apprenantId === res.apprenantId, detail: "Il s'agit de son propre dossier" };
    } else if (h.role === "parent") {
      const lien = p.niveau === "famille" && monde.liens.find((l) => l.responsableNpi === p.responsableNpi && l.apprenantId === res.apprenantId);
      relation = lien
        ? { critere: "relation", satisfait: lien.verifie, detail: lien.verifie ? "Lien de filiation vérifié au registre national" : "Lien de filiation en attente de vérification" }
        : { critere: "relation", satisfait: false, detail: "Aucun lien de filiation ou de tutelle avec cet apprenant" };
    } else if (h.role === "enseignant") {
      const profilEns = monde.enseignants.find((e) => e.npi === profil.npi);
      const enseigne = !!situation.classe && monde.enseignements.some((x) => x.classeId === situation.classe!.id && x.enseignantId === profilEns?.id);
      relation = { critere: "relation", satisfait: enseigne, detail: enseigne ? `Relation pédagogique : enseigne en ${situation.classe!.libelle}` : "Aucune relation pédagogique : cet élève n'est dans aucune de ses classes" };
    } else if (h.role === "chef_etablissement") {
      relation = { critere: "relation", satisfait: dansPerimetre, detail: dansPerimetre ? "Rattachement administratif à l'établissement" : "Aucun rattachement administratif" };
    } else {
      relation = { critere: "relation", satisfait: false, detail: "Ce rôle n'accède qu'à des données agrégées, jamais à un dossier individuel" };
    }
  } else if (res.type === "indicateur") {
    const p = h.perimetre;
    const commune = res.communeId ? communeById.get(res.communeId) : undefined;
    const dep = res.departementId ?? commune?.departementId;
    const etab = res.etablissementId ? [...monde.etablissements].find((e) => e.id === res.etablissementId) : undefined;
    const ok =
      p.niveau === "national" ? true
        : p.niveau === "departement" ? !!dep && dep === p.departementId
        : p.niveau === "circonscription" ? (!!res.communeId && `CS ${commune?.nom}` === p.circonscription) || (!!etab && etab.circonscription === p.circonscription)
        : p.niveau === "etablissement" ? res.etablissementId === p.etablissementId
        : false;
    perimetre = { critere: "perimetre", satisfait: ok, detail: ok ? "Territoire compris dans le périmètre" : "Territoire hors du périmètre de l'habilitation" };
    relation = { critere: "relation", satisfait: true, detail: "Données agrégées : aucune relation individuelle requise" };
  } else {
    perimetre = { critere: "perimetre", satisfait: h.perimetre.niveau === "national", detail: "Journal d'audit national" };
    relation = { critere: "relation", satisfait: h.role === "dpo", detail: h.role === "dpo" ? "Mission de contrôle de conformité" : "Aucune mission de contrôle" };
  }
  return [role, perimetre, relation, finalite];
}

export function decider(profil: Profil, demande: Demande, ctx: Contexte): DecisionAcces {
  let meilleure: { h: Habilitation; criteres: EvaluationCritere[] } | null = null;
  for (const h of profil.habilitations) {
    // Enseignant-parent : la finalité déclarée désigne l'habilitation au titre de laquelle il agit.
    const criteres = evaluerHabilitation(profil, h, demande, ctx);
    const score = criteres.filter((c) => c.satisfait).length;
    if (score === 4) {
      return { autorise: true, criteres, auTitreDe: h, motif: `Accès accordé au titre de l'habilitation « ${ROLE_LIBELLE[h.role]} »` };
    }
    if (!meilleure || score > meilleure.criteres.filter((c) => c.satisfait).length) meilleure = { h, criteres };
  }
  const criteres = meilleure?.criteres ?? [];
  const manquant = criteres.find((c) => !c.satisfait);
  return {
    autorise: false,
    criteres,
    auTitreDe: null,
    motif: manquant ? `Accès refusé — critère « ${manquant.critere} » non satisfait : ${manquant.detail}` : "Accès refusé",
  };
}
