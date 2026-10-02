import type { Profil } from "@beile/contracts";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { adresseIp, ErreurCodee } from "./commun";
import { lireEnv } from "./env";

/**
 * Portails séparés (lot D). Une même base de code, plusieurs déploiements cloisonnés, chacun déclarant son
 * portail (BEILE_PORTAIL) : ce qu'il sert, et qui peut s'y connecter.
 *
 *   public    portail.beile.bj     annuaire, chiffres, résultats, vérification de diplômes — AUCUNE connexion
 *   usagers   usagers.beile.bj     élèves, familles, enseignants
 *   gestion   gestion.beile.bj     établissements, inspections, directions départementales
 *   national  console (hors Internet public, liste d'adresses obligatoire) : ministères, DPO, chercheurs,
 *             administrateurs de niveau 0 à 2, connecteurs des systèmes partenaires
 *   unique    tout (déploiement de démonstration actuel)
 *
 * L'ABAC reste seul juge de chaque accès : le portail ne fait que réduire la surface exposée — une session
 * volée sur un portail ne vaut rien sur un autre, et le portail public ne sait rien faire d'une session.
 */
export type Portail = "unique" | "public" | "usagers" | "gestion" | "national";

export const ROLES_DU_PORTAIL: Record<Exclude<Portail, "unique" | "public">, string[]> = {
  usagers: ["apprenant", "parent", "enseignant"],
  gestion: ["chef_etablissement", "inspecteur", "direction_departementale"],
  national: ["administration_centrale", "chercheur", "dpo", "administrateur"],
};
const NOMS: Record<Portail, string> = { unique: "unique", public: "public", usagers: "des usagers", gestion: "de gestion", national: "national" };

/** Routes du portail public : lecture seule, sans session. */
const ROUTES_PUBLIQUES = /^\/api\/v1\/(sante$|public\/|certificats\/[^/]+\/verification$|actes\/[^/]+\/verification$|dictionnaire(\/[^/]+)?$|referentiels\/[a-z]+$|auth\/etat$)/;

/** Filtre réseau et surface exposée, avant toute route. */
export const filtrePortail: MiddlewareHandler = async (c, next) => {
  const { PORTAIL, IP_AUTORISEES } = lireEnv();
  if (IP_AUTORISEES.length) {
    const ip = adresseIp(c);
    if (!IP_AUTORISEES.some((p) => ip === p || (p.endsWith(".") && ip.startsWith(p)))) throw new ErreurCodee(403, "Ce portail n'est accessible que depuis le réseau de l'administration.", "portail_reseau");
  }
  if (PORTAIL === "public" && (c.req.method !== "GET" || !ROUTES_PUBLIQUES.test(c.req.path))) throw new HTTPException(404, { message: "Introuvable" });
  if (c.req.path.includes("/interop/") && PORTAIL !== "unique" && PORTAIL !== "national") throw new HTTPException(404, { message: "Introuvable" });
  await next();
};

/**
 * Un profil n'ouvre de session que sur le portail de ses fonctions (cumul : l'une d'elles suffit). Les
 * administrateurs délégués de niveau 0 à 2 relèvent du portail national.
 */
export function exigerPortail(profil: Pick<Profil, "habilitations">, administrateurNational: boolean) {
  const { PORTAIL } = lireEnv();
  if (PORTAIL === "unique") return;
  if (PORTAIL === "public") throw new ErreurCodee(403, "Le portail public ne permet aucune connexion.", "portail");
  const permis = ROLES_DU_PORTAIL[PORTAIL];
  if (profil.habilitations.some((h) => permis.includes(h.role)) || (PORTAIL === "national" && administrateurNational)) return;
  const bon = (Object.entries(ROLES_DU_PORTAIL) as [Portail, string[]][]).find(([, r]) => profil.habilitations.some((h) => r.includes(h.role)))?.[0];
  throw new ErreurCodee(403, `Ce compte ne relève pas du portail ${NOMS[PORTAIL]}${bon ? ` : connectez-vous sur le portail ${NOMS[bon]}` : ""}.`, "portail");
}
