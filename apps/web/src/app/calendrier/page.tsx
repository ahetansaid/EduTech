"use client";

import { CalendarClock, CalendarDays, Info, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PagePublique } from "@/components/public/CadrePublic";
import { AnimatePresence, Compteur, EASE, motion } from "@/components/motion";
import { EtatVide, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { useCalendrier, type Echeance } from "@/lib/api/public";
import { avancement, CATEGORIES, dateLongue, lignesFrise, moisAnnee, moisDeLAnnee, periode, position, prochaine, jours } from "@/lib/calendrier";

export default function PageCalendrier() {
  const [annee, setAnnee] = useState<string | undefined>();
  const [survol, setSurvol] = useState<{ e: Echeance; x: number; y: number } | null>(null);
  const { data, isPending, isError, refetch } = useCalendrier(annee);

  if (isError) return (
    <PagePublique surtitre="Année scolaire" titre="Calendrier scolaire">
      <EtatVide icone={CalendarDays} titre="Le calendrier n'a pas pu être chargé" action={<button onClick={() => refetch()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Réessayer</button>} />
    </PagePublique>
  );
  if (isPending || !data) return (
    <PagePublique surtitre="Année scolaire" titre="Calendrier scolaire">
      <div className="grid gap-4 md:grid-cols-2"><Squelette className="h-40 rounded-2xl" /><Squelette className="h-40 rounded-2xl" /></div>
      <Squelette className="mt-5 h-48 rounded-2xl" />
    </PagePublique>
  );
  if (!data.annee) return (
    <PagePublique surtitre="Année scolaire" titre="Calendrier scolaire">
      <EtatVide icone={CalendarDays} titre="Le calendrier sera publié prochainement" />
    </PagePublique>
  );

  const ev = data.evenements;
  const auj = data.aujourdhui;
  const prog = avancement(ev, auj);
  const suite = prochaine(ev, auj);
  const provisoires = ev.filter((e) => e.statut === "provisoire").length;
  const lignes = lignesFrise(ev);
  const sources = [...new Set(ev.filter((e) => e.statut === "officiel" && e.note).map((e) => e.note!))];
  const sansExamens = !ev.some((e) => e.categorie === "examen");
  const parMois = ev.reduce<Record<string, Echeance[]>>((m, e) => { (m[e.debut.slice(0, 7)] ??= []).push(e); return m; }, {});

  return (
    <PagePublique large surtitre={`Année scolaire ${data.annee}`} titre="Calendrier scolaire" intro="Rentrée, congés et examens nationaux : où en est l'année, et ce qui arrive.">
      {data.annees.length > 1 && (
        <div className="-mt-4 mb-6 inline-flex rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Année scolaire">
          {data.annees.map((a) => (
            <button key={a} role="radio" aria-checked={a === data.annee} onClick={() => setAnnee(a)}
              className={cn("relative rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors", a === data.annee ? "text-ink" : "text-ink-muted hover:text-ink")}>
              {a === data.annee && <motion.span layoutId="annee-active" className="absolute inset-0 rounded-full bg-surface shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
              <span className="relative">{a}</span>
            </button>
          ))}
        </div>
      )}

      {provisoires > 0 && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-warning/25 bg-warning-bg px-5 py-3.5 text-[13.5px] text-warning">
          <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p>{provisoires === ev.length ? "Toutes les dates sont" : `${provisoires} date${provisoires > 1 ? "s sont" : " est"}`} <strong>provisoires</strong> : elles seront confirmées par arrêté ministériel et mises à jour ici.</p>
        </div>
      )}

      {sources.length > 0 && provisoires === 0 && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-success/20 bg-success-bg px-5 py-3.5 text-[13.5px] text-success">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p><strong>Calendrier officiel.</strong> {sources.join(" ")}{sansExamens ? " Les dates des examens nationaux (CEP, BEPC, BAC) sont publiées séparément et seront ajoutées dès leur parution." : ""}</p>
        </div>
      )}

      {/* Prochaine échéance et avancement */}
      <motion.div key={data.annee} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="grid gap-4 md:grid-cols-2">
        <section className="relative overflow-hidden rounded-2xl bg-navy p-6 text-white shadow-float">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5" aria-hidden />
          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60"><CalendarClock size={15} aria-hidden /> {suite?.enCours ? "En ce moment" : "Prochaine échéance"}</p>
          {suite ? (
            <>
              {suite.periodeEnCours && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-medium text-white/85">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-flag-yellow" aria-hidden /> En cours : {suite.periodeEnCours.titre} · semaine {suite.periodeEnCours.semaine} sur {suite.periodeEnCours.semaines}
                </p>
              )}
              <p className="mt-3 font-display text-[22px] font-bold leading-tight">{suite.echeance.titre}</p>
              <p className="mt-1 text-[14px] text-white/75">{periode(suite.echeance).replace(/^\w/, (x) => x.toUpperCase())}</p>
              <p className="mt-5 flex items-baseline gap-2">
                {suite.enCours ? <span className="font-display text-[34px] font-extrabold text-flag-yellow">Aujourd&apos;hui</span> : (
                  <><span className="font-display text-[44px] font-extrabold leading-none text-flag-yellow"><Compteur valeur={suite.dans} format={(v) => String(Math.round(v))} /></span>
                    <span className="text-[15px] text-white/75">jour{suite.dans > 1 ? "s" : ""}</span></>
                )}
              </p>
            </>
          ) : <p className="mt-3 text-[15px] text-white/80">L&apos;année scolaire est terminée.</p>}
        </section>
        <section className="rounded-2xl border border-line/70 bg-surface p-6 shadow-float">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Avancement de l&apos;année</p>
          {prog && (
            <>
              <p className="mt-3 font-display text-[22px] font-bold text-ink">
                {prog.avant ? `Rentrée dans ${prog.joursAvantRentree} jour${prog.joursAvantRentree > 1 ? "s" : ""}` : prog.apres ? "Année terminée" : <><Compteur valeur={prog.pourcentage} format={(v) => `${Math.round(v)} %`} /> de l&apos;année écoulée</>}
              </p>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-flag-green,#008751),var(--color-flag-yellow,#FCD116),var(--color-flag-red,#E8112D))]"
                  initial={{ width: 0 }} animate={{ width: `${prog.pourcentage}%` }} transition={{ duration: 1.1, ease: EASE }} />
              </div>
              <div className="mt-2 flex justify-between text-[12.5px] text-ink-muted">
                <span>Rentrée · {dateLongue(prog.rentree).replace(/^\w/, (x) => x.toUpperCase())}</span>
                <span className="hidden sm:inline">{!prog.avant && !prog.apres ? `${prog.joursRestants} jours restants` : ""}</span>
              </div>
            </>
          )}
        </section>
      </motion.div>

      {/* Frise de l'année */}
      <section className="mt-5 hidden rounded-2xl border border-line/70 bg-surface p-6 shadow-float md:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-bold text-ink">L&apos;année d&apos;un coup d&apos;œil</h2>
          <ul className="flex flex-wrap gap-4 text-[12.5px] text-ink-2">
            {Object.entries(CATEGORIES).filter(([k]) => ev.some((e) => e.categorie === k)).map(([k, c]) => (
              <li key={k} className="flex items-center gap-1.5"><span className={cn("h-2.5 w-2.5 rounded-full", c.point)} aria-hidden /> {c.libelle}</li>
            ))}
          </ul>
        </div>
        <div className="relative mt-6">
          <div className="ml-24 grid grid-cols-11 border-b border-line/70 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-muted">
            {moisDeLAnnee(data.annee).map((m) => <span key={m.cle} className="text-center">{m.court}</span>)}
          </div>
          {/* La frise se révèle dans l'ordre du temps : chaque échéance apparaît avec un délai proportionnel à sa date,
              puis « aujourd'hui » glisse de la rentrée jusqu'à la date du jour, au rythme de la barre d'avancement. */}
          <div className="mt-3 flex">
          <div className="w-24 shrink-0 text-[12px] font-medium text-ink-muted" aria-hidden>
            {lignes.map((l, i) => <p key={l.libelle} className="flex h-10 items-center leading-tight" style={{ marginTop: i === 0 ? 4 : 0 }}>{l.libelle}</p>)}
          </div>
          <div key={data.annee} className="relative flex-1" style={{ height: lignes.length * 40 + 12 }} onMouseLeave={() => setSurvol(null)}>
            <div className="absolute inset-0 grid grid-cols-11" aria-hidden>{Array.from({ length: 11 }, (_, i) => <span key={i} className={cn("border-line/50", i > 0 && "border-l")} />)}</div>
            <motion.div aria-hidden className="pointer-events-none absolute inset-y-0 w-24 bg-[linear-gradient(90deg,transparent,rgb(21_103_196/0.10),transparent)]"
              initial={{ left: "-6rem", opacity: 1 }} animate={{ left: "100%", opacity: 0 }} transition={{ duration: 1.4, ease: "easeInOut", opacity: { delay: 1.1, duration: 0.3 } }} />
            {lignes.map((groupe, ligne) =>
              groupe.echeances.map((e) => {
                const g = position(data.annee!, e.debut), d = position(data.annee!, e.fin);
                const actif = survol?.e.id === e.id;
                return (
                  <motion.button key={e.id} type="button" aria-label={`${e.titre}, ${periode(e)}, ${e.statut}`}
                    onMouseEnter={() => setSurvol({ e, x: (g + d) / 2, y: 8 + ligne * 40 })} onFocus={() => setSurvol({ e, x: (g + d) / 2, y: 8 + ligne * 40 })} onBlur={() => setSurvol(null)}
                    initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: 1, scaleX: 1, y: actif ? -2 : 0 }}
                    transition={{ delay: 0.1 + (g / 100) * 1.1, duration: 0.45, ease: EASE, y: { duration: 0.15 } }}
                    className={cn("absolute h-7 origin-left rounded-full shadow-sm outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-blue/30", CATEGORIES[e.categorie].barre,
                      actif && "shadow-pop", e.statut === "provisoire" && "[background-image:repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(255_255_255/0.25)_6px,rgb(255_255_255/0.25)_12px)]")}
                    style={{ left: `${g}%`, width: `max(${d - g}%, 22px)`, top: 8 + ligne * 40 }} />
                );
              }),
            )}
            {auj >= `${data.annee.slice(0, 4)}-09-01` && auj <= `${data.annee.slice(5)}-07-31` && (
              <motion.div className="absolute -top-2 bottom-0 z-10 w-0.5 bg-navy" initial={{ left: "0%", opacity: 0 }}
                animate={{ left: `${position(data.annee, auj)}%`, opacity: 1 }} transition={{ delay: 0.3, duration: 1.1, ease: EASE, opacity: { delay: 0.3, duration: 0.2 } }}>
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-navy px-2 py-0.5 text-[10.5px] font-semibold text-white">Aujourd&apos;hui</span>
                <motion.span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-navy" animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }} transition={{ delay: 1.5, duration: 2, repeat: Infinity }} />
              </motion.div>
            )}
            <AnimatePresence>
              {survol && (
                <motion.div key={survol.e.id} role="tooltip" initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4, scale: 0.98 }} transition={{ duration: 0.16 }}
                  className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-xl border border-line/70 bg-surface p-3 shadow-pop"
                  style={{ left: `clamp(8rem, ${survol.x}%, calc(100% - 8rem))`, top: survol.y - 8 }}>
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-ink"><span className={cn("h-2.5 w-2.5 rounded-full", CATEGORIES[survol.e.categorie].point)} />{survol.e.titre}</p>
                  <p className="mt-1 text-[12.5px] text-ink-2">{periode(survol.e).replace(/^\w/, (x) => x.toUpperCase())}</p>
                  <p className={cn("mt-1.5 text-[11.5px] font-semibold", survol.e.statut === "officiel" ? "text-success" : "text-warning")}>{survol.e.statut === "officiel" ? "Date officielle" : "Date provisoire, à confirmer"}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>
          <p className="mt-9 text-[12px] text-ink-muted">{provisoires > 0 ? "Les barres hachurées signalent des dates provisoires. " : ""}Survolez une barre pour le détail.</p>
        </div>
      </section>

      {/* Détail mois par mois */}
      <section className="mt-8">
        <h2 className="font-display text-[20px] font-bold text-ink">Toutes les échéances</h2>
        <div className="mt-4 space-y-6">
          <AnimatePresence mode="popLayout">
            {Object.entries(parMois).map(([mois, liste]) => (
              <motion.div key={`${data.annee}-${mois}`} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }}>
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{moisAnnee(`${mois}-01`)}</p>
                <ul className="mt-2 space-y-2">
                  {liste.map((e) => {
                    const passe = e.fin < auj, enCours = e.debut <= auj && auj <= e.fin;
                    return (
                      <li key={e.id} className={cn("flex items-center gap-4 rounded-2xl border bg-surface p-4 shadow-float transition", enCours ? "border-blue/40 ring-2 ring-blue/20" : "border-line/70", passe && "opacity-60")}>
                        <span className={cn("flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl", CATEGORIES[e.categorie].doux)}>
                          <span className="text-[17px] font-bold leading-none">{Number(e.debut.slice(8))}</span>
                          <span className="text-[10px] font-semibold uppercase">{new Date(`${e.debut}T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "")}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-ink">{e.titre}</p>
                          <p className="text-[13px] text-ink-2">{periode(e).replace(/^\w/, (x) => x.toUpperCase())}{e.debut !== e.fin ? ` · ${jours(e.debut, e.fin) + 1} jours` : ""}</p>
                        </div>
                        <span className={cn("hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold sm:inline-flex", e.statut === "officiel" ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")}>
                          {e.statut === "officiel" ? <><ShieldCheck size={13} aria-hidden /> Officiel</> : "Provisoire"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>
    </PagePublique>
  );
}
