import { fileURLToPath } from "node:url";
import type { Habilitation } from "@beile/contracts";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { connecter } from "./index";
import * as t from "./schema";

/**
 * Arbre des organisations et amorçage de l'administration déléguée. Idempotent.
 *   npm run organisations -w @beile/db
 *
 * - L'arbre est dérivé du territoire et des établissements (tutelle, circonscription, rattachement).
 * - L'autorité de la plateforme (niveau 0) est désignée par BEILE_AUTORITE_NOM (DSI du ministère ou ASIN).
 * - Les droits déjà posés sur les profils sont repris comme attributions datées (garant : « reprise »).
 * - Délégations d'amorçage : l'administrateur de la plateforme au niveau 0 ; en démonstration, le cabinet,
 *   la direction départementale et les chefs d'établissement à leur niveau.
 */
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const { db, client } = connecter(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
const AUTORITE_NOM = process.env.BEILE_AUTORITE_NOM ?? "Autorité de la plateforme BEILE";
const UN_AN = 365 * 86_400_000;

const MINISTERES = [
  { code: "MEMP", nom: "Ministère chargé de l'enseignement maternel et primaire" },
  { code: "MESTFP", nom: "Ministère chargé de l'enseignement secondaire, technique et professionnel" },
  { code: "MESRS", nom: "Ministère chargé de l'enseignement supérieur" },
];
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Rôles qu'un administrateur peut attribuer selon le type d'organisation qu'il administre (plafond par défaut). */
export const ROLES_DELEGABLES: Record<string, string[]> = {
  autorite: ["administration_centrale", "dpo", "chercheur", "direction_departementale", "inspecteur", "chef_etablissement", "enseignant"],
  ministere: ["administration_centrale", "direction_departementale", "inspecteur", "chef_etablissement", "enseignant"],
  organisme: ["administration_centrale"],
  departement: ["inspecteur", "chef_etablissement", "enseignant"],
  universite: ["chef_etablissement", "enseignant"],
  circonscription: ["chef_etablissement", "enseignant"],
  etablissement: ["enseignant", "apprenant", "parent"],
};
export const NIVEAU_DU_TYPE: Record<string, number> = { autorite: 0, ministere: 1, organisme: 1, departement: 2, universite: 2, circonscription: 3, etablissement: 3 };

try {
  const departements = await db.select({ id: t.departements.id, nom: t.departements.nom }).from(t.departements);
  const communes = new Map((await db.select({ id: t.communes.id, dep: t.communes.departementId }).from(t.communes)).map((c) => [c.id, c.dep]));
  const etabs = await db.select({ id: t.etablissements.id, nom: t.etablissements.nom, ministere: t.etablissements.ministereTutelle, type: t.etablissements.typeInstitution, communeId: t.etablissements.communeId, circonscription: t.etablissements.circonscription, rattachementId: t.etablissements.rattachementId }).from(t.etablissements);

  type Org = typeof t.organisations.$inferInsert;
  const orgs: Org[] = [
    { id: "ORG-AUTORITE", type: "autorite", nom: AUTORITE_NOM, parentId: null },
    ...MINISTERES.map((m) => ({ id: `ORG-MIN-${m.code}`, type: "ministere" as const, nom: m.nom, parentId: "ORG-AUTORITE", ministere: m.code })),
    { id: "ORG-EXAMENS", type: "organisme", nom: "Autorités des examens nationaux", parentId: "ORG-AUTORITE" },
    { id: "ORG-DBAU", type: "organisme", nom: "Direction des bourses et aides universitaires", parentId: "ORG-MIN-MESRS", ministere: "MESRS" },
    ...departements.flatMap((d) => (["MEMP", "MESTFP"] as const).map((m) => ({
      id: `ORG-DD-${m}-${d.id}`, type: "departement" as const, nom: `Direction départementale (${m === "MEMP" ? "maternel et primaire" : "secondaire"}) — ${d.nom}`,
      parentId: `ORG-MIN-${m}`, ministere: m, departementId: d.id,
    }))),
  ];
  // Circonscriptions scolaires (primaire) : sous la direction départementale du primaire.
  const circos = new Map<string, { nom: string; dep: string }>();
  for (const e of etabs) if (e.ministere === "MEMP" && e.circonscription) {
    const dep = communes.get(e.communeId);
    if (dep) circos.set(`${dep}|${e.circonscription}`, { nom: e.circonscription, dep });
  }
  for (const [cle, c] of circos) orgs.push({ id: `ORG-CS-${slug(cle)}`, type: "circonscription", nom: `Circonscription scolaire ${c.nom.replace(/^CS /, "")}`, parentId: `ORG-DD-MEMP-${c.dep}`, ministere: "MEMP", departementId: c.dep, circonscription: c.nom });
  // Établissements : rattachés à leur circonscription (primaire), à leur direction départementale (secondaire),
  // à leur université ou au ministère (supérieur).
  const idEtab = (id: string) => `ORG-ETB-${id}`;
  const universites = new Set(etabs.filter((e) => e.type === "universite").map((e) => e.id));
  const etabOrgs: Org[] = etabs.map((e) => {
    const dep = communes.get(e.communeId) ?? null;
    const parent = e.ministere === "MEMP" && dep && e.circonscription ? `ORG-CS-${slug(`${dep}|${e.circonscription}`)}`
      : e.ministere === "MESTFP" && dep ? `ORG-DD-MESTFP-${dep}`
      : e.ministere === "MESRS" ? (e.rattachementId && universites.has(e.rattachementId) ? idEtab(e.rattachementId) : "ORG-MIN-MESRS")
      : `ORG-MIN-${e.ministere}`;
    return { id: idEtab(e.id), type: universites.has(e.id) ? "universite" as const : "etablissement" as const, nom: e.nom, parentId: parent, ministere: e.ministere, departementId: dep, circonscription: e.circonscription, etablissementId: e.id };
  });
  // Les universités d'abord (parents des composantes), puis le reste.
  const ordonnes = [...orgs, ...etabOrgs.filter((o) => o.type === "universite"), ...etabOrgs.filter((o) => o.type !== "universite")];

  await db.transaction(async (tx) => {
    for (let i = 0; i < ordonnes.length; i += 500) {
      await tx.insert(t.organisations).values(ordonnes.slice(i, i + 500)).onConflictDoUpdate({
        target: t.organisations.id,
        set: { nom: sql`excluded.nom`, parentId: sql`excluded.parent_id`, type: sql`excluded.type`, ministere: sql`excluded.ministere`, departementId: sql`excluded.departement_id`, circonscription: sql`excluded.circonscription` },
      });
    }

    // Reprise des droits existants comme attributions datées (une seule fois par profil et rôle).
    const profils = await tx.select().from(t.profils);
    const deja = new Set((await tx.select({ p: t.attributions.profilId, r: t.attributions.role }).from(t.attributions)).map((a) => `${a.p}|${a.r}`));
    const orgDuPerimetre = async (h: Habilitation): Promise<string> => {
      const p = h.perimetre;
      if (p.niveau === "etablissement") return idEtab(p.etablissementId);
      if (p.niveau === "departement") return `ORG-DD-MESTFP-${p.departementId}`;
      if (p.niveau === "circonscription") return [...circos.entries()].find(([, c]) => c.nom === p.circonscription) ? `ORG-CS-${slug([...circos.entries()].find(([, c]) => c.nom === p.circonscription)![0])}` : "ORG-AUTORITE";
      if (p.niveau === "personnel" || p.niveau === "famille") {
        // Élève : son établissement ; responsable légal : l'établissement du premier enfant rattaché.
        const [s] = (await tx.execute(p.niveau === "personnel"
          ? sql`select coalesce(s.etablissement_id, c.etablissement_id) as etablissement_id from core.scolarites s left join core.classes c on c.id = s.classe_id where s.apprenant_id = ${p.apprenantId} limit 1`
          : sql`select coalesce(s.etablissement_id, c.etablissement_id) as etablissement_id from core.liens_familiaux l join core.scolarites s on s.apprenant_id = l.apprenant_id left join core.classes c on c.id = s.classe_id where l.responsable_npi = ${p.responsableNpi} order by l.apprenant_id limit 1`)) as unknown as { etablissement_id: string }[];
        return s?.etablissement_id ? idEtab(s.etablissement_id) : "ORG-AUTORITE";
      }
      return "ORG-AUTORITE";
    };
    const idsOrgs = new Set(ordonnes.map((o) => o.id));
    for (const p of profils) {
      for (const h of p.habilitations as Habilitation[]) {
        if (deja.has(`${p.id}|${h.role}`) || h.role === "administrateur") continue;
        const org = await orgDuPerimetre(h);
        await tx.insert(t.attributions).values({
          id: `ATT-${p.id}-${h.role}`, profilId: p.id, role: h.role, perimetre: h.perimetre, organisationId: idsOrgs.has(org) ? org : "ORG-AUTORITE",
          accordeePar: null, motif: "Reprise des droits existants", au: new Date(Date.now() + UN_AN),
        }).onConflictDoNothing();
      }
    }

    // Délégations d'amorçage (seulement si le profil existe et n'en a pas déjà une sur cette organisation).
    const existe = new Set(profils.map((p) => p.id));
    const amorces: { profil: string; org: string; motif: string }[] = [
      { profil: "p-admin", org: "ORG-AUTORITE", motif: "Autorité de la plateforme (niveau 0)" },
      { profil: "p-central", org: "ORG-MIN-MESTFP", motif: "Démonstration : administrateur de ministère" },
      { profil: "p-departement", org: "ORG-DD-MESTFP-borgou", motif: "Démonstration : administrateur départemental" },
      ...profils.flatMap((p) => (p.habilitations as Habilitation[]).filter((h) => h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement")
        .map((h) => ({ profil: p.id, org: idEtab((h.perimetre as { etablissementId: string }).etablissementId), motif: "Démonstration : administrateur d'établissement" }))),
    ];
    const types = new Map(ordonnes.map((o) => [o.id, o.type]));
    for (const a of amorces) {
      if (!existe.has(a.profil) || !idsOrgs.has(a.org)) continue;
      const type = types.get(a.org)!;
      await tx.insert(t.delegations).values({
        id: `DLG-${a.profil}-${a.org}`, profilId: a.profil, organisationId: a.org, niveau: NIVEAU_DU_TYPE[type]!,
        rolesDelegables: ROLES_DELEGABLES[type]!, peutNommer: type !== "etablissement", statut: "active",
        accordeePar: null, motif: a.motif, au: new Date(Date.now() + UN_AN),
      }).onConflictDoNothing();
    }
  });

  const [n] = (await db.execute(sql`select (select count(*) from core.organisations)::int orgs, (select count(*) from core.attributions)::int attributions, (select count(*) from core.delegations)::int delegations`)) as unknown as { orgs: number; attributions: number; delegations: number }[];
  console.log(`Organisations : ${n!.orgs} · attributions reprises : ${n!.attributions} · délégations : ${n!.delegations} (autorité : ${AUTORITE_NOM}).`);
} finally {
  await client.end();
}
