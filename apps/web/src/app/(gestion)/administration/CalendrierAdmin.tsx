"use client";

import { CalendarDays, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Button, Card, EtatVide, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { CategorieEcheance, Echeance } from "@/lib/api/public";
import { CATEGORIES, periode } from "@/lib/calendrier";
import { ecrire, ErreurApi, lire } from "@/lib/http";
import { CHAMP, Champ } from "./communs";

/** Gestion du calendrier scolaire : l'administration publie et corrige les dates ; le public voit leur statut. */
const CLE = ["administration", "calendrier"] as const;
type Brouillon = Omit<Echeance, "id" | "majLe"> & { id?: string };

const anneeCourante = () => {
  const d = new Date(), a = d.getUTCMonth() >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return `${a}-${a + 1}`;
};
const vide = (annee: string): Brouillon => ({ annee, titre: "", categorie: "conges", debut: "", fin: "", statut: "provisoire", note: null });

export function CalendrierAdmin() {
  const client = useQueryClient();
  const liste = useQuery({ queryKey: CLE, queryFn: () => lire<Echeance[]>("/admin/calendrier") });
  const [edition, setEdition] = useState<Brouillon | null>(null);
  const [aSupprimer, setASupprimer] = useState<Echeance | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const rafraichir = () => { void client.invalidateQueries({ queryKey: CLE }); void client.invalidateQueries({ queryKey: ["public", "calendrier"] }); };

  const enregistrer = useMutation({
    mutationFn: (b: Brouillon) => {
      const { id, ...corps } = b;
      return ecrire(id ? `/admin/calendrier/${encodeURIComponent(id)}` : "/admin/calendrier", { ...corps, note: corps.note?.trim() || null });
    },
    onSuccess: (_r, b) => { notifier({ ton: "succes", titre: b.id ? "Échéance mise à jour" : "Échéance ajoutée", texte: "Le calendrier public est à jour." }); setEdition(null); rafraichir(); },
    onError: (e) => setErreur(e instanceof ErreurApi ? e.message : "Enregistrement impossible"),
  });
  const supprimer = useMutation({
    mutationFn: (e: Echeance) => ecrire(`/admin/calendrier/${encodeURIComponent(e.id)}/supprimer`),
    onSuccess: () => { notifier({ ton: "succes", titre: "Échéance supprimée" }); setASupprimer(null); rafraichir(); },
  });

  if (liste.isPending) return <div className="space-y-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-16 rounded-xl" />)}</div>;
  if (liste.isError) return <EtatVide icone={CalendarDays} titre="Calendrier indisponible" action={<Button onClick={() => liste.refetch()}>Réessayer</Button>} />;

  const parAnnee = liste.data.reduce<Record<string, Echeance[]>>((m, e) => { (m[e.annee] ??= []).push(e); return m; }, {});
  const annees = Object.keys(parAnnee).sort().reverse();
  const provisoires = liste.data.filter((e) => e.statut === "provisoire").length;

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-[13.5px] text-ink-2">
          {provisoires ? <><strong className="text-warning">{provisoires} date{provisoires > 1 ? "s" : ""} provisoire{provisoires > 1 ? "s" : ""}</strong> : passez-les en « officiel » dès la parution de l&apos;arrêté.</> : "Toutes les dates publiées sont officielles."}
        </p>
        <Button icone={Plus} onClick={() => { setErreur(null); setEdition(vide(annees[0] ?? anneeCourante())); }}>Ajouter une échéance</Button>
      </Card>

      {annees.length === 0 && <EtatVide icone={CalendarDays} titre="Aucune échéance publiée" texte="Ajoutez la rentrée, les congés et les examens de l'année." />}
      {annees.map((a) => (
        <section key={a}>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Année scolaire {a}</p>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-line/70">
              <AnimatePresence initial={false}>
                {parAnnee[a]!.map((e) => (
                  <motion.li key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 30 }} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:px-5">
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", CATEGORIES[e.categorie].point)} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.titre}</p>
                      <p className="text-xs text-ink-muted">{CATEGORIES[e.categorie].libelle} · {periode(e)}</p>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", e.statut === "officiel" ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
                      {e.statut === "officiel" ? <><ShieldCheck size={12} aria-hidden /> Officiel</> : "Provisoire"}
                    </span>
                    <div className="flex shrink-0 gap-1">
                      <Button taille="sm" variante="fantome" icone={Pencil} onClick={() => { setErreur(null); setEdition({ ...e }); }} aria-label={`Modifier ${e.titre}`}>Modifier</Button>
                      <Button taille="sm" variante="fantome" icone={Trash2} onClick={() => setASupprimer(e)} aria-label={`Supprimer ${e.titre}`} className="text-critical" />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        </section>
      ))}

      <Modale ouvert={!!edition} onFermer={() => setEdition(null)} titre={edition?.id ? "Modifier l'échéance" : "Nouvelle échéance"} sousTitre="Publiée immédiatement sur le calendrier public." icone={CalendarDays}
        pied={<><Button variante="secondaire" onClick={() => setEdition(null)}>Annuler</Button><Button chargement={enregistrer.isPending} onClick={() => edition && enregistrer.mutate(edition)}>Enregistrer</Button></>}>
        {edition && (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); enregistrer.mutate(edition); }}>
            <Champ id="cal-titre" libelle="Intitulé" className="sm:col-span-2">
              <input id="cal-titre" className={CHAMP} value={edition.titre} maxLength={90} onChange={(ev) => setEdition({ ...edition, titre: ev.target.value })} placeholder="Ex. Congés de fin d'année" />
            </Champ>
            <Champ id="cal-annee" libelle="Année scolaire">
              <input id="cal-annee" className={CHAMP} value={edition.annee} onChange={(ev) => setEdition({ ...edition, annee: ev.target.value })} placeholder="2026-2027" />
            </Champ>
            <Champ id="cal-cat" libelle="Catégorie">
              <select id="cal-cat" className={CHAMP} value={edition.categorie} onChange={(ev) => setEdition({ ...edition, categorie: ev.target.value as CategorieEcheance })}>
                {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.libelle}</option>)}
              </select>
            </Champ>
            <Champ id="cal-debut" libelle="Début">
              <input id="cal-debut" type="date" className={CHAMP} value={edition.debut} onChange={(ev) => setEdition({ ...edition, debut: ev.target.value, fin: edition.fin && edition.fin >= ev.target.value ? edition.fin : ev.target.value })} />
            </Champ>
            <Champ id="cal-fin" libelle="Fin">
              <input id="cal-fin" type="date" className={CHAMP} value={edition.fin} min={edition.debut || undefined} onChange={(ev) => setEdition({ ...edition, fin: ev.target.value })} />
            </Champ>
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">Statut</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {([["officiel", "Officiel", "Fixé par arrêté ministériel"], ["provisoire", "Provisoire", "Affiché « à confirmer » au public"]] as const).map(([v, l, d]) => (
                  <label key={v} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 transition", edition.statut === v ? "border-blue bg-blue-soft/50" : "border-line hover:bg-surface-2")}>
                    <input type="radio" name="cal-statut" className="mt-1" checked={edition.statut === v} onChange={() => setEdition({ ...edition, statut: v })} />
                    <span><span className="block text-sm font-semibold text-ink">{l}</span><span className="block text-xs text-ink-muted">{d}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Champ id="cal-note" libelle="Note" facultatif className="sm:col-span-2">
              <input id="cal-note" className={CHAMP} value={edition.note ?? ""} maxLength={200} onChange={(ev) => setEdition({ ...edition, note: ev.target.value })} placeholder="Ex. Arrêté n° … du …" />
            </Champ>
            {erreur && <p className="rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical sm:col-span-2" role="alert">{erreur}</p>}
          </form>
        )}
      </Modale>

      <Modale ouvert={!!aSupprimer} onFermer={() => setASupprimer(null)} titre="Supprimer cette échéance ?" sousTitre={aSupprimer ? `${aSupprimer.titre} · ${periode(aSupprimer)}` : ""} icone={Trash2} ton="critique"
        pied={<><Button variante="secondaire" onClick={() => setASupprimer(null)}>Annuler</Button><Button variante="danger" chargement={supprimer.isPending} onClick={() => aSupprimer && supprimer.mutate(aSupprimer)}>Supprimer</Button></>}>
        <p className="text-sm text-ink-2">Elle disparaît immédiatement du calendrier public. L&apos;opération est inscrite au journal d&apos;audit.</p>
      </Modale>
    </div>
  );
}
