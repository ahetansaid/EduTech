import type { Profil } from "@beile/contracts";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { adresseIp, base, ErreurCodee } from "./commun";
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

/**
 * Contrôle, une fois par instance, du rôle PostgreSQL réellement utilisé : jamais un superutilisateur ni un
 * rôle qui contourne la sécurité des lignes ; et le portail public n'a que les droits du rôle public (une
 * fuite de sa chaîne de connexion ne doit rien ouvrir d'autre).
 */
let controleRole: Promise<string | null> | null = null;
function verifierRoleBase(portail: Portail) {
  controleRole ??= (async () => {
    const [r] = (await base().execute(sql`select r.rolsuper, r.rolbypassrls,
        pg_has_role(current_user, 'beile_app', 'USAGE') as app, pg_has_role(current_user, 'beile_portail_public', 'USAGE') as public
      from pg_roles r where r.rolname = current_user`)) as unknown as { rolsuper: boolean; rolbypassrls: boolean; app: boolean; public: boolean }[];
    if (!r) return "rôle de connexion introuvable";
    if (r.rolsuper || r.rolbypassrls) return "l'API refuse un rôle superutilisateur ou BYPASSRLS";
    if (portail === "public" && (r.app || !r.public)) return "le portail public exige un rôle membre de beile_portail_public seulement";
    return null;
  })().catch(() => {
    // Un incident de base n'est pas une absence de défaut : le contrôle repart à la requête suivante au lieu
    // de rester mémoïsé en « conforme » pour toute la durée de l'instance.
    controleRole = null;
    return "le contrôle du rôle de base n'a pas pu être rendu";
  });
  return controleRole;
}

/** Filtre réseau et surface exposée, avant toute route. */
export const filtrePortail: MiddlewareHandler = async (c, next) => {
  const { PORTAIL, IP_AUTORISEES } = lireEnv();
  const defaut = await verifierRoleBase(PORTAIL);
  if (defaut) {
    console.error(JSON.stringify({ niveau: "critique", message: `Configuration de base refusée : ${defaut}` }));
    throw new HTTPException(503, { message: "Service indisponible (configuration)" });
  }
  if (IP_AUTORISEES.length) {
    const ip = adresseIp(c);
    if (!IP_AUTORISEES.some((p) => ip === p || (p.endsWith(".") && ip.startsWith(p)))) throw new ErreurCodee(403, "Ce portail n'est accessible que depuis le réseau de l'administration.", "portail_reseau");
  }
  // Seule écriture du portail public : la recherche de résultat avec date de naissance (POST, la date hors de l'URL).
  const lecture = c.req.method === "GET" && ROUTES_PUBLIQUES.test(c.req.path);
  const recherche = c.req.method === "POST" && c.req.path === "/api/v1/public/resultats";
  if (PORTAIL === "public" && !lecture && !recherche) throw new HTTPException(404, { message: "Introuvable" });
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
