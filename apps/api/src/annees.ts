import { randomUUID } from "node:crypto";
import type { Profil } from "@beile/contracts";
import { schema } from "@beile/db";
import { aujourdhui } from "@beile/simulation/scolarite";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, corps, journaliser, refuser, type Variables } from "./commun";
import { inscrireAuRegistre } from "./ecriture";
import { couvreEtab } from "./etablissement";

/**
 * Clôture des années scolaires (docs/cadrage/EMPLOI_DU_TEMPS.md, décision 4).
 *
 * Une année est CLOSE pour un établissement quand la rentrée suivante est passée (calendrier officiel) ET qu'il n'y
 * reste plus aucun élève scolarisé — l'école a basculé (conseils de passage faits). Filet de sécurité : close dans
 * tous les cas un an après la rentrée suivante. Une école en retard sur sa bascule n'est donc pas figée en plein
 * travail, et une année oubliée finit quand même par se figer.
 *
 * Close, elle n'accepte plus d'écriture (inscriptions, services, emploi du temps). Seule la direction
 * départementale dont relève l'établissement peut la rouvrir, au plus 30 jours, avec un motif inscrit au registre
 * (fait REOUVERTURE_ANNEE) et au journal.
 */
export const annees = new Hono<{ Variables: Variables }>();

const ID_ETAB = z.string().regex(/^ETB-[A-Za-z0-9-]+$/);
const ANNEE = z.string().regex(/^\d{4}-\d{4}$/).refine((a) => Number(a.slice(5)) === Number(a.slice(0, 4)) + 1, "année scolaire AAAA-AAAA");

export type StatutAnnee = "en_cours" | "ouverte" | "close" | "rouverte" | "inconnue";
export interface EtatAnnee { anneeScolaire: string; ouverte: boolean; statut: StatutAnnee; raison: string; rentreeSuivante: string; scolarises: number; jusquAu?: string }

/** Rentrée de l'année suivante, lue au calendrier officiel ; à défaut le 1er octobre (rentrée la plus tardive admise). */
async function rentreeSuivante(annee: string) {
  const fin = Number(annee.slice(5));
  const [r] = await base().select({ debut: schema.calendrier.debut }).from(schema.calendrier)
    .where(and(eq(schema.calendrier.annee, `${fin}-${fin + 1}`), eq(schema.calendrier.categorie, "rentree"))).orderBy(schema.calendrier.debut).limit(1);
  return { date: r?.debut ?? `${fin}-10-01`, officielle: !!r };
}

interface Elements {
  annee: string; j: string; classes: number; scolarises: number; rentree: string; officielle: boolean;
  /** Dernière réouverture connue (la plus tardive) : jusquAu et motif ; null si l'année n'a jamais été rouverte. */
  reouverture: { jusquAu: string; motif: string } | null;
}

/**
 * Calcul pur de l'état d'une année. STABILITÉ : une année déjà rouverte au moins une fois est réputée close en dehors de
 * toute fenêtre de réouverture, quel que soit le nombre d'élèves — sinon une seule inscription faite pendant la fenêtre
 * la garderait ouverte jusqu'à un an, au-delà des 30 jours accordés.
 */
function calculer(e: Elements): EtatAnnee {
  const debutCourant = Number(e.j.slice(0, 4)) - (Number(e.j.slice(5, 7)) < 9 ? 1 : 0);
  const courante = e.annee === `${debutCourant}-${debutCourant + 1}` || e.annee === `${debutCourant + 1}-${debutCourant + 2}`;
  const limite = `${Number(e.rentree.slice(0, 4)) + 1}${e.rentree.slice(4)}`;
  const base_ = { anneeScolaire: e.annee, rentreeSuivante: e.rentree, scolarises: e.scolarises };
  if (!courante && !e.classes) return { ...base_, ouverte: false, statut: "inconnue", raison: `Aucune classe de ${e.annee} dans cet établissement` };
  if (e.j < e.rentree) return { ...base_, ouverte: true, statut: courante ? "en_cours" : "ouverte", raison: `Ouverte jusqu'à la rentrée suivante (${e.rentree}${e.officielle ? "" : ", date par défaut"})` };
  const close = !!e.reouverture || e.scolarises === 0 || e.j >= limite;
  if (!close) return { ...base_, ouverte: true, statut: "ouverte", raison: `Rentrée suivante passée, mais ${e.scolarises} élève(s) encore scolarisé(s) en ${e.annee} : l'année se fermera quand l'école aura basculé, au plus tard le ${limite}` };
  if (e.reouverture && e.reouverture.jusquAu >= e.j) {
    return { ...base_, ouverte: true, statut: "rouverte", raison: `Rouverte jusqu'au ${e.reouverture.jusquAu} par la direction départementale : ${e.reouverture.motif}`, jusquAu: e.reouverture.jusquAu };
  }
  const raison = e.reouverture ? `Close : réouverture terminée le ${e.reouverture.jusquAu}`
    : e.scolarises === 0 ? `Close : la rentrée ${e.rentree} est passée et plus aucun élève n'y est scolarisé` : `Close : un an après la rentrée suivante (${limite})`;
  return { ...base_, ouverte: false, statut: "close", raison };
}

/** Réouvertures (la plus tardive) par établissement et année. */
async function reouvertures(etablissementIds: string[]) {
  if (!etablissementIds.length) return new Map<string, { jusquAu: string; motif: string }>();
  const lignes = await base().execute<{ e: string; a: string; jusqu_au: string; motif: string }>(sql`
    select distinct on (etablissement_id, donnees->>'anneeScolaire') etablissement_id as e, donnees->>'anneeScolaire' as a, donnees->>'jusquAu' as jusqu_au, donnees->>'motif' as motif
    from ledger.evenements where type = 'REOUVERTURE_ANNEE' and etablissement_id in ${etablissementIds}
    order by etablissement_id, donnees->>'anneeScolaire', donnees->>'jusquAu' desc`);
  return new Map(lignes.map((l) => [`${l.e}|${l.a}`, { jusquAu: l.jusqu_au, motif: l.motif }]));
}

export async function etatAnnee(etablissementId: string, annee: string): Promise<EtatAnnee> {
  const [{ classes, scolarises } = { classes: 0, scolarises: 0 }] = await base().execute<{ classes: number; scolarises: number }>(sql`
    select count(distinct c.id)::int as classes, count(distinct s.apprenant_id) filter (where s.statut = 'scolarise')::int as scolarises
    from core.classes c left join core.scolarites s on s.classe_id = c.id
    where c.etablissement_id = ${etablissementId} and c.annee_scolaire = ${annee}`);
  const r = await rentreeSuivante(annee);
  const ro = (await reouvertures([etablissementId])).get(`${etablissementId}|${annee}`) ?? null;
  return calculer({ annee, j: aujourdhui(), classes: Number(classes), scolarises: Number(scolarises), rentree: r.date, officielle: r.officielle, reouverture: ro });
}

/** Raccourci des points d'écriture (imports, emploi du temps, inscription). */
export async function anneeOuverte(etablissementId: string, annee: string) {
  return (await etatAnnee(etablissementId, annee)).ouverte;
}

async function etablissementDe(id: string) {
  const [etab] = await base().select({ id: schema.etablissements.id, communeId: schema.etablissements.communeId, circonscription: schema.etablissements.circonscription })
    .from(schema.etablissements).where(eq(schema.etablissements.id, id));
  if (!etab) throw new HTTPException(404, { message: "Établissement inconnu" });
  return etab;
}
const directionDepartementale = (profil: Profil, etab: { id: string; communeId: string; circonscription: string }) =>
  profil.habilitations.some((h) => h.role === "direction_departementale" && h.perimetre.niveau === "departement" && couvreEtab(h, etab));

/** États des années d'un établissement : son administration, son inspection, sa direction départementale. */
annees.get("/etablissements/:id/annees", authentifie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const etab = await etablissementDe(id);
  const autorise = directionDepartementale(profil, etab) || profil.habilitations.some((h) =>
    (h.role === "chef_etablissement" && h.perimetre.niveau === "etablissement" && h.perimetre.etablissementId === id)
    || (h.role === "inspecteur" && h.perimetre.niveau === "circonscription" && h.perimetre.circonscription === etab.circonscription));
  if (!autorise) {
    await journaliser(profil, "Consultation des années scolaires", id, "gestion", false, "perimetre");
    refuser("Établissement hors de votre périmètre : refus journalisé");
  }
  const lignes = await base().selectDistinct({ a: schema.classes.anneeScolaire }).from(schema.classes).where(eq(schema.classes.etablissementId, id));
  const etats = await Promise.all(lignes.map((l) => etatAnnee(id, l.a)));
  return c.json({ reouvrable: directionDepartementale(profil, etab), annees: etats.sort((a, b) => b.anneeScolaire.localeCompare(a.anneeScolaire)) });
});

/**
 * Direction départementale : les années de ses établissements dont la rentrée suivante est passée — closes,
 * rouvertes, ou encore ouvertes faute de bascule (école en retard). C'est là qu'elle rouvre une année close.
 */
annees.get("/annees-scolaires/a-suivre", authentifie, async (c) => {
  const profil = c.get("profil");
  const habs = profil.habilitations.filter((h) => h.role === "direction_departementale" && h.perimetre.niveau === "departement");
  if (!habs.length) {
    await journaliser(profil, "Suivi des années scolaires", "département", "gestion", false, "role");
    refuser("Réservé à la direction départementale : refus journalisé");
  }
  // Trois requêtes en tout, filtrées par département EN BASE : classes et élèves par (école, année), rentrées du
  // calendrier, réouvertures. Aucun appel par ligne.
  const departements = [...new Set(habs.map((h) => (h.perimetre as { departementId: string }).departementId))];
  const lignes = await base().execute<{ etablissement_id: string; annee: string; nom: string; classes: number; scolarises: number }>(sql`
    select c.etablissement_id, c.annee_scolaire as annee, e.nom, count(distinct c.id)::int as classes,
      count(distinct s.apprenant_id) filter (where s.statut = 'scolarise')::int as scolarises
    from core.classes c join core.etablissements e on e.id = c.etablissement_id join core.communes m on m.id = e.commune_id
    left join core.scolarites s on s.classe_id = c.id
    where m.departement_id in ${departements}
    group by 1, 2, 3`);
  const j = aujourdhui();
  const calendrier = await base().select({ annee: schema.calendrier.annee, debut: schema.calendrier.debut }).from(schema.calendrier).where(eq(schema.calendrier.categorie, "rentree"));
  const rentreeDe = (annee: string) => {
    const fin = Number(annee.slice(5));
    const r = calendrier.filter((x) => x.annee === `${fin}-${fin + 1}`).map((x) => x.debut).sort()[0];
    return { date: r ?? `${fin}-10-01`, officielle: !!r };
  };
  const ro = await reouvertures([...new Set(lignes.map((l) => l.etablissement_id))]);
  const unAnAvant = `${Number(j.slice(0, 4)) - 1}${j.slice(4)}`;
  const etats = lignes.flatMap((l) => {
    const r = rentreeDe(l.annee);
    // Seulement les années dont la rentrée suivante est passée, et pas les très anciennes (limite dépassée de plus d'un
    // an) — SAUF une année rouverte, qui reste toujours visible pour la direction qui l'a rouverte.
    const reouverture = ro.get(`${l.etablissement_id}|${l.annee}`) ?? null;
    if (j < r.date || (!reouverture && `${Number(r.date.slice(0, 4)) + 1}${r.date.slice(4)}` < unAnAvant)) return [];
    const etat = calculer({ annee: l.annee, j, classes: Number(l.classes), scolarises: Number(l.scolarises), rentree: r.date, officielle: r.officielle, reouverture });
    return [{ etablissementId: l.etablissement_id, etablissement: l.nom, ...etat }];
  }).sort((a, b) => a.statut.localeCompare(b.statut) || a.etablissement.localeCompare(b.etablissement) || b.anneeScolaire.localeCompare(a.anneeScolaire));
  const LIMITE = 500;
  await journaliser(profil, "Suivi des années scolaires", `${etats.length} année(s) d'établissement`, "gestion", true, null);
  return c.json({ total: etats.length, tronque: etats.length > LIMITE, annees: etats.slice(0, LIMITE) });
});

/** Réouverture temporaire d'une année close (direction départementale de l'établissement) : 1 à 30 jours, motif obligatoire. */
annees.post("/etablissements/:id/annees/:annee/reouverture", authentifie, async (c) => {
  const profil = c.get("profil");
  const id = ID_ETAB.parse(c.req.param("id"));
  const annee = ANNEE.parse(c.req.param("annee"));
  const etab = await etablissementDe(id);
  if (!directionDepartementale(profil, etab)) {
    await journaliser(profil, "Réouverture d'une année scolaire", `${id} · ${annee}`, "gestion", false, "role");
    refuser("Seule la direction départementale dont relève l'établissement rouvre une année close : refus journalisé");
  }
  const s = await corps(c, z.object({ motif: z.string().trim().min(10).max(200), jours: z.number().int().min(1).max(30) }).strict());
  const etat = await etatAnnee(id, annee);
  if (etat.statut !== "close") throw new HTTPException(409, { message: `Année ${annee} non close (${etat.raison}) : rien à rouvrir` });
  const fin = new Date(`${aujourdhui()}T00:00:00Z`); fin.setUTCDate(fin.getUTCDate() + s.jours - 1);
  const jusquAu = fin.toISOString().slice(0, 10);
  await inscrireAuRegistre([{ type: "REOUVERTURE_ANNEE", auteurId: profil.id, etablissementId: id, apprenantId: null, donnees: { anneeScolaire: annee, jusquAu, motif: s.motif, idReouverture: `ROA-${randomUUID()}` } }]);
  await journaliser(profil, "Réouverture d'une année scolaire", `${id} · ${annee} · jusqu'au ${jusquAu} · ${s.motif}`.slice(0, 200), "gestion", true, null);
  return c.json(await etatAnnee(id, annee), 201);
});
