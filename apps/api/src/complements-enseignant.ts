import { schema } from "@beile/db";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { authentifie, base, journaliser, refuser, type Variables } from "./commun";
import { enseignantDe } from "./parcours";

/** Routes complémentaires de l'espace « enseignant » (ajoutées pendant le branchement du front). */
export const complementsEnseignant = new Hono<{ Variables: Variables }>();

const ID_CLASSE = z.string().regex(/^CLS-[A-Za-z0-9-]+$/);

/**
 * Historique d'une classe pour l'enseignant qui y a une relation pédagogique :
 * - appels : absences regroupées par date déclarée de l'appel (clé naturelle classe + date + élève,
 *   utilisée aussi par le front pour ne jamais rejouer une absence déjà acceptée après une coupure réseau) ;
 * - corrections de notes de SES matières : note d'origine (jamais effacée), note précédente, nouvelle note, motif, date.
 * Refus journalisé comme pour le carnet.
 */
complementsEnseignant.get("/classes/:id/historique", authentifie, async (c) => {
  const profil = c.get("profil");
  const classeId = ID_CLASSE.parse(c.req.param("id"));
  const [classe] = await base().select({ id: schema.classes.id }).from(schema.classes).where(eq(schema.classes.id, classeId));
  if (!classe) throw new HTTPException(404, { message: "Classe inconnue" });
  const e = await enseignantDe(profil);
  const matieres = e ? (await base().select({ m: schema.enseignements.matiere }).from(schema.enseignements)
    .where(and(eq(schema.enseignements.enseignantId, e.id), eq(schema.enseignements.classeId, classeId)))).map((x) => x.m) : [];
  if (!matieres.length) {
    await journaliser(profil, "Consultation de l'historique d'une classe", classeId, "evaluation", false, e ? "relation" : "role");
    refuser("Aucune relation pédagogique avec cette classe : consultation refusée et journalisée");
  }

  const [absences, corrections] = await Promise.all([
    base().execute<{ id: string; apprenant_id: string; date: string; justifiee: boolean | null; enregistre_le: string }>(sql`
      select id, apprenant_id, donnees->>'date' as date, (donnees->>'justifiee')::boolean as justifiee, enregistre_le
      from ledger.evenements
      where type = 'ABSENCE' and donnees->>'classeId' = ${classeId}
      order by donnees->>'date' desc, enregistre_le desc
    `),
    base().execute<{ id: string; le: string; evenement_corrige_id: string; apprenant_id: string; nouvelle_note: number; motif: string; matiere: string; trimestre: number; note_initiale: number }>(sql`
      select e.id, e.survenu_le as le, e.donnees->>'evenementCorrigeId' as evenement_corrige_id, e.apprenant_id,
        (e.donnees->>'nouvelleNote')::float8 as nouvelle_note, e.donnees->>'motif' as motif,
        n.matiere, n.trimestre, n.note_initiale
      from ledger.evenements e
      join core.notes n on n.evenement_id = e.donnees->>'evenementCorrigeId'
      where e.type = 'CORRECTION_EVALUATION' and n.classe_id = ${classeId}
        and n.matiere in (select jsonb_array_elements_text(${JSON.stringify(matieres)}::jsonb))
      order by e.survenu_le asc
    `),
  ]);

  // Appels : une entrée par date déclarée, 60 dernières dates.
  const parDate = new Map<string, { date: string; saisiLe: string; absents: { id: string; apprenantId: string; justifiee: boolean }[] }>();
  for (const a of absences) {
    const d = parDate.get(a.date) ?? { date: a.date, saisiLe: new Date(a.enregistre_le).toISOString(), absents: [] };
    d.absents.push({ id: a.id, apprenantId: a.apprenant_id, justifiee: !!a.justifiee });
    if (new Date(a.enregistre_le).toISOString() > d.saisiLe) d.saisiLe = new Date(a.enregistre_le).toISOString();
    parDate.set(a.date, d);
  }

  // Corrections : la note « précédente » d'une correction en chaîne est la nouvelle note de la correction d'avant.
  const derniere = new Map<string, number>();
  const chronologie = corrections.map((k) => {
    const precedente = derniere.get(k.evenement_corrige_id) ?? Number(k.note_initiale);
    derniere.set(k.evenement_corrige_id, Number(k.nouvelle_note));
    return {
      id: k.id, le: new Date(k.le).toISOString(), evenementCorrigeId: k.evenement_corrige_id, apprenantId: k.apprenant_id,
      matiere: k.matiere, trimestre: Number(k.trimestre), noteInitiale: Number(k.note_initiale), notePrecedente: precedente,
      nouvelleNote: Number(k.nouvelle_note), motif: k.motif,
    };
  });

  await journaliser(profil, "Consultation de l'historique d'une classe", classeId, "evaluation", true, null);
  return c.json({
    classeId,
    appels: [...parDate.values()].slice(0, 60),
    corrections: chronologie.reverse(),
  });
});
