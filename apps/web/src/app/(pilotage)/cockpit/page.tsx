"use client";

import type { ResultatIndicateur } from "@beile/contracts";
import { Activity, ArrowRight, Building2, GraduationCap, Map as IconeCarte, Radio, School, Sparkles, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarresClassees, Courbes } from "@/components/charts/Graphiques";
import { AnimatePresence, Cascade, Compteur, EASE, Element, motion } from "@/components/motion";
import { CarteBenin, COULEUR_ALERTE, LegendeSequentielle } from "@/components/map/CarteBenin";
import { BadgeConfiance, TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { compact, dateLongue, entier, heure, nombre, pourcent } from "@/lib/format";
import { useCouche, useFlux, useSynthese, type CouchePilotage, type SynthesePilotage } from "@/lib/api/pilotage";
import { communeById } from "@beile/simulation/territoire";
import {
  ALERTE, EtatEchec, ilYa, LegendeAlertes, libelleFait, nomCommune, nomDepartement, PastilleNiveau, pluriel, pointTon, SqueletteLignes, SqueletteTuiles, tonFait, useMaintenant,
} from "../_commun";

/**
 * Cockpit (processus P3) : chiffres clés, séries, parité, classement territorial, zones prioritaires et
 * flux des faits du jour. Tout vient de l'API, calculé sous le périmètre de l'habilitation.
 */

type Couche = "priorites" | CouchePilotage;
const COUCHES: { valeur: Couche; libelle: string }[] = [
  { valeur: "priorites", libelle: "Priorités" },
  { valeur: "maths", libelle: "Maths ≥ 15" },
  { valeur: "ratio", libelle: "Élèves / ens." },
  { valeur: "occupation", libelle: "Occupation" },
  { valeur: "absenteisme", libelle: "Absentéisme" },
  { valeur: "abandon", libelle: "Abandon" },
];

const serie = (r: ResultatIndicateur) => r.lignes.map((l) => l.valeur ?? 0);
const ecartAnnuel = (r: ResultatIndicateur) => {
  const v = serie(r);
  return (v.at(-1) ?? 0) - (v.at(-2) ?? 0);
};
const signe = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${nombre(Math.abs(v), d)}`;
const anneeCourte = (a: string) => a.replace("-20", "-");

export default function Cockpit() {
  const synthese = useSynthese();

  if (synthese.isPending) return <ChargementCockpit />;
  if (synthese.isError) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Cockpit" titre="Situation du système éducatif" />
        <EtatEchec erreur={synthese.error} onReessayer={() => synthese.refetch()} titreRefus="Cockpit réservé aux habilitations de pilotage" />
      </div>
    );
  }
  return <Tableau s={synthese.data} />;
}

function ChargementCockpit() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2"><Squelette className="h-3 w-56" /><Squelette className="h-8 w-80 max-w-full" /><Squelette className="h-4 w-[32rem] max-w-full" /></div>
      <SqueletteTuiles n={5} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Squelette className="h-[520px] rounded-xl lg:col-span-2" />
        <Card className="min-w-0"><SqueletteLignes n={8} /></Card>
      </div>
    </div>
  );
}

function Tableau({ s }: { s: SynthesePilotage }) {
  const router = useRouter();
  const national = s.perimetre.niveau === "national";
  const territoire = national ? "departement" : "commune";
  const variationEffectif = ecartAnnuel(s.effectif);
  const tauxTransmission = (s.etablissements.transmis / Math.max(1, s.etablissements.total)) * 100;

  const critiques = useMemo(
    () => Object.entries(s.priorites).filter(([, p]) => p.niveau === "critique" || p.niveau === "attention").sort((a, b) => b[1].score - a[1].score || nomCommune(a[0]).localeCompare(nomCommune(b[0]), "fr")),
    [s.priorites],
  );

  const parite = (["F", "M"] as const).map((sx) => ({
    nom: sx === "F" ? "Filles" : "Garçons",
    points: s.mathsSexe.lignes.filter((l) => l.cle.endsWith(`¦${sx}`)).map((l) => ({ x: anneeCourte(l.cle.split("¦")[0]!), y: l.valeur })),
  }));
  const derniereF = parite[0]!.points.at(-1)?.y ?? null;
  const derniereM = parite[1]!.points.at(-1)?.y ?? null;
  const ecartParite = derniereF != null && derniereM != null ? derniereF - derniereM : null;

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Cockpit · ${s.perimetre.libelle} · ${dateLongue(s.date)}`}
        titre="Situation du système éducatif"
        sousTitre="Chiffres calculés sur le registre national et le dictionnaire des indicateurs, sous le périmètre de votre habilitation. Chaque valeur porte sa définition, sa source et son indice de confiance."
        actions={
          <>
            <Link href="/ask"><Button data-guide="cockpit-question" variante="secondaire" icone={Sparkles}>Poser une question</Button></Link>
            <Link href="/cockpit/carte"><Button data-guide="cockpit-ou-agir" icone={ArrowRight}>Où agir ?</Button></Link>
          </>
        }
      />

      <Cascade data-guide="cockpit-indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Element>
          <TuileIndicateur
            libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={s.effectif.valeur ?? 0} format={compact} />}
            tendance={serie(s.effectif)} variation={{ texte: `${variationEffectif >= 0 ? "+" : "−"}${compact(Math.abs(variationEffectif))} sur un an`, favorable: variationEffectif >= 0 }} confiance={s.effectif.confiance}
          />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Établissements" icone={School} accent="sarcelle" valeur={<Compteur valeur={s.etablissements.total} format={entier} />}
            indice={<span>{pourcent(tauxTransmission, 0)} ont transmis</span>}
          />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Enseignants" icone={GraduationCap} accent="bleu" valeur={<Compteur valeur={s.enseignants} format={compact} />}
            tendance={serie(s.ratio).map((v) => -v)} indice={<span>{nombre(s.ratio.valeur, 1)} élèves par enseignant</span>} confiance={s.ratio.confiance}
          />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Réussite au BEPC" icone={Building2} accent="ambre" valeur={<Compteur valeur={s.bepc.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%"
            tendance={serie(s.bepc)} variation={{ texte: `${signe(ecartAnnuel(s.bepc))} pt sur un an`, favorable: ecartAnnuel(s.bepc) >= 0 }} confiance={s.bepc.confiance}
          />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Maths ≥ 15/20" icone={Activity} accent="sarcelle" valeur={<Compteur valeur={s.maths.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%"
            tendance={serie(s.maths)} variation={{ texte: `${signe(ecartAnnuel(s.maths))} pt sur un an`, favorable: ecartAnnuel(s.maths) >= 0 }} confiance={s.maths.confiance}
          />
        </Element>
      </Cascade>

      <div className="grid gap-6 lg:grid-cols-3">
        <CarteCockpit s={s} className="lg:col-span-2" />
        <FluxDuJour className="lg:col-span-1" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader icon={Activity} title="Mathématiques ≥ 15/20, par sexe" subtitle={`Proportion des apprenants évalués, ${anneeCourte(s.mathsSexe.lignes[0]?.cle.split("¦")[0] ?? "")} à ${anneeCourte(s.anneeScolaire)}`} action={<BadgeConfiance confiance={s.mathsSexe.confiance} />} />
          <Courbes formater={(v) => pourcent(v)} series={parite} />
          {ecartParite != null && (
            <p className="mt-2 text-[12.5px] text-ink-2">
              Écart filles − garçons en {s.anneeScolaire} : <span className="font-semibold text-ink tabular">{signe(ecartParite)} pt</span>.
              <span className="text-ink-muted"> Corrélation n'est pas causalité : ce constat appelle une évaluation, pas une conclusion.</span>
            </p>
          )}
        </Card>
        <Card className="min-w-0">
          <CardHeader
            icon={IconeCarte}
            title={`Maths ≥ 15/20 par ${national ? "département" : "commune"}`}
            subtitle={`Année ${s.anneeScolaire} · trait vertical : ${s.perimetre.libelle.toLowerCase()} (${pourcent(s.maths.valeur)})`}
            action={<BadgeConfiance confiance={s.mathsTerritoire.confiance} />}
          />
          {s.mathsTerritoire.lignes.length ? (
            <BarresClassees
              barres={s.mathsTerritoire.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.valeur, masquee: l.masquee, effectif: l.effectif }))}
              formater={(v) => pourcent(v)}
              reference={s.maths.valeur != null ? { valeur: s.maths.valeur, libelle: national ? "Moyenne nationale" : "Moyenne du périmètre" } : undefined}
              onSelect={(cle) => router.push(territoire === "commune" ? `/cockpit/carte?commune=${cle}` : `/cockpit/carte?departement=${cle}`)}
              limite={12}
            />
          ) : (
            <EtatVide icone={IconeCarte} titre="Aucun territoire à classer" texte="Votre périmètre ne compte qu'une zone : le classement n'a pas de sens ici." />
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader icon={Users} title="Abandon scolaire" subtitle="Part des inscrits ayant quitté le système sans transfert" action={<BadgeConfiance confiance={s.abandon.confiance} />} />
          <Courbes formater={(v) => pourcent(v)} min={0} series={[{ nom: "Taux d'abandon", points: s.abandon.lignes.map((l) => ({ x: anneeCourte(l.cle), y: l.valeur })) }]} hauteur={210} />
          <p className="mt-2 text-[12.5px] text-ink-2">
            {signe((s.abandon.valeur ?? 0) - (s.abandon.lignes[0]?.valeur ?? 0))} point depuis {s.abandon.lignes[0]?.cle ?? "—"}. Indicateur annuel : la valeur {s.anneeScolaire} reste provisoire jusqu'à la validation de fin d'année.
          </p>
        </Card>
        <Card data-guide="cockpit-priorites" className="min-w-0">
          <CardHeader icon={TriangleAlert} title="Zones à examiner en priorité" subtitle={`${pluriel(critiques.length, "commune")} en « Attention » ou « Critique »`} />
          {critiques.length ? (
            <ul className="divide-y divide-line/60">
              {critiques.slice(0, 7).map(([id, p], i) => (
                <motion.li key={id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3, ease: EASE }}>
                  <Link href={`/cockpit/carte?commune=${id}`} className="flex min-h-11 items-center gap-3 rounded-md px-1.5 py-2.5 hover:bg-surface-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COULEUR_ALERTE[p.niveau] }} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{nomCommune(id)}</span>
                      <span className="block truncate text-xs text-ink-muted">{p.facteurs.filter((f) => f.grave).map((f) => f.libelle.split(" (")[0]).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">{ALERTE[p.niveau].court}</span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          ) : (
            <EtatVide icone={TriangleAlert} titre="Aucune zone en alerte" texte="Aucune commune de votre périmètre ne dépasse deux seuils d'alerte." />
          )}
          {critiques.length > 7 && <Link href="/cockpit/carte" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-blue hover:underline">Voir toutes les zones sur la carte <ArrowRight size={14} aria-hidden /></Link>}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Carte à couches */

function CarteCockpit({ s, className }: { s: SynthesePilotage; className?: string }) {
  const [couche, setCouche] = useState<Couche>("priorites");
  const [commune, setCommune] = useState<string | null>(null);
  const donnees = useCouche(couche === "priorites" ? null : couche);

  const ids = Object.keys(s.priorites);
  const departements = new Set(ids.map((id) => communeById.get(id)?.departementId));
  const focus = s.perimetre.niveau !== "national" && departements.size === 1 ? [...departements][0] : undefined;

  const valeurs = useMemo(() => (couche !== "priorites" && donnees.data ? new Map(Object.entries(donnees.data.valeurs)) : undefined), [couche, donnees.data]);
  const couleurs = useMemo(() => (couche === "priorites" ? new Map(Object.entries(s.priorites).map(([id, p]) => [id, COULEUR_ALERTE[p.niveau]])) : undefined), [couche, s.priorites]);
  const bornes = valeurs ? [...valeurs.values()].filter((v): v is number => v != null) : [];
  const formater = couche === "ratio" ? (v: number) => nombre(v, 0) : (v: number) => pourcent(v);
  const libelle = COUCHES.find((c) => c.valeur === couche)!.libelle;
  const sel = commune ? s.priorites[commune] : null;
  const critiques = Object.entries(s.priorites).filter(([, p]) => p.niveau === "critique" || p.niveau === "attention").sort((a, b) => b[1].score - a[1].score);

  return (
    <Card data-guide="cockpit-carte" className={cn("min-w-0 overflow-hidden p-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Carte des {pluriel(ids.length, "commune")}{focus ? ` · ${nomDepartement(focus)}` : ""}</h2>
          <p className="text-[12.5px] text-ink-muted">Cliquez sur une commune pour comprendre sa situation.</p>
        </div>
        <div className="max-w-full overflow-x-auto">
          <div className="w-max"><Segmente label="Couche affichée" options={COUCHES} valeur={couche} onChange={setCouche} /></div>
        </div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_15rem] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className={cn("relative min-w-0 transition-opacity", donnees.isFetching && couche !== "priorites" && "opacity-60")}>
          {donnees.isError && couche !== "priorites" ? (
            <EtatEchec erreur={donnees.error} onReessayer={() => donnees.refetch()} className="shadow-none" />
          ) : (
            <CarteBenin
              valeurs={valeurs}
              couleurs={couleurs}
              focusDepartement={focus}
              selection={commune}
              onSelect={(id) => { if (s.priorites[id]) setCommune((c) => (c === id ? null : id)); }}
              formater={formater}
              libelleValeur={libelle}
              hauteur={600}
              className="mx-auto w-full max-w-[420px]"
              legende={couche !== "priorites" ? (
                bornes.length ? <LegendeSequentielle min={Math.min(...bornes)} max={Math.max(...bornes)} libelle={`${donnees.data?.definition.nom ?? libelle} · hachures : donnée masquée ou absente`} formater={formater} /> : null
              ) : <LegendeAlertes />}
            />
          )}
          {couche !== "priorites" && donnees.data && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-muted">Source : {donnees.data.definition.source} <BadgeConfiance confiance={donnees.data.confiance} compact /></p>
          )}
        </div>
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            {sel && commune ? (
              <motion.div key={commune} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.28, ease: EASE }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{nomDepartement(communeById.get(commune)?.departementId)}</p>
                <p className="font-display text-[20px] font-bold text-ink">{nomCommune(commune)}</p>
                <PastilleNiveau niveau={sel.niveau} className="mt-2" />
                {valeurs?.get(commune) != null && <p className="mt-3 text-[13px] text-ink-2">{libelle} : <span className="font-semibold text-ink tabular">{formater(valeurs.get(commune)!)}</span></p>}
                <p className="mt-4 text-[12px] font-semibold text-ink-2">Pourquoi ?</p>
                <ul className="mt-2 space-y-2">
                  {sel.facteurs.map((f) => (
                    <li key={f.libelle} className={cn("rounded-md px-3 py-2 text-[12.5px]", f.grave ? "bg-critical-bg" : "bg-surface-2")}>
                      <span className="block text-ink-2">{f.libelle}</span>
                      <span className={cn("font-semibold tabular", f.grave ? "text-critical" : "text-ink")}>{f.valeur}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/cockpit/carte?commune=${commune}`} className="mt-4 inline-flex min-h-10 items-center gap-1 text-[13px] font-semibold text-blue hover:underline">Descendre jusqu'aux établissements <ArrowRight size={14} aria-hidden /></Link>
              </motion.div>
            ) : (
              <motion.div key="liste" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                <p className="text-[12px] font-semibold text-ink-2">Zones à examiner en priorité</p>
                {critiques.length ? (
                  <ul className="mt-2 space-y-0.5">
                    {critiques.slice(0, 9).map(([id, p]) => (
                      <li key={id}>
                        <button type="button" onClick={() => setCommune(id)} className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COULEUR_ALERTE[p.niveau] }} aria-hidden />
                          <span className="flex-1 truncate text-[13px] text-ink">{nomCommune(id)}</span>
                          <span className="text-[11.5px] text-ink-muted">{pluriel(p.score, "facteur")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-[12.5px] text-ink-muted">Aucune commune en attention ni en situation critique.</p>}
                <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Chaque couleur s'explique : un niveau résulte du nombre de facteurs dépassant leur seuil (croissance, occupation, encadrement, absentéisme, résultats).</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Flux des faits du jour (15 s) */

function FluxDuJour({ className }: { className?: string }) {
  const flux = useFlux(12);
  const maintenant = useMaintenant(15_000);
  const d = flux.data;

  return (
    <Card data-guide="cockpit-flux" className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader
        icon={Radio}
        title="Flux des faits du jour"
        subtitle={d ? `Registre national · actualisé ${ilYa(d.horodatage, maintenant)}` : "Registre national · actualisation toutes les 15 s"}
        action={
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-success-bg px-2 py-0.5 text-[12px] font-semibold text-success">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            En direct
          </span>
        }
      />
      {flux.isPending ? (
        <SqueletteLignes n={7} />
      ) : flux.isError && !d ? (
        <EtatEchec erreur={flux.error} onReessayer={() => flux.refetch()} className="border-0 p-0 shadow-none" />
      ) : d ? (
        <>
          <div className="flex items-end justify-between gap-3 rounded-lg bg-surface-2/70 px-4 py-3">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Faits enregistrés aujourd'hui</p>
              <p className="mt-1 font-display text-2xl font-semibold leading-none text-ink" aria-live="polite"><Compteur valeur={d.total} format={entier} /></p>
            </div>
            {flux.isFetching && <span className="text-[11px] text-ink-muted">actualisation…</span>}
          </div>
          {d.parType.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {d.parType.slice(0, 5).map((t) => (
                <Badge key={t.type} ton={tonFait(t.type)}>{libelleFait(t.type)} · <span className="tabular">{entier(t.n)}</span></Badge>
              ))}
            </div>
          )}
          {d.derniers.length ? (
            <ul className="mt-3 divide-y divide-line/60" aria-live="polite" aria-relevant="additions">
              <AnimatePresence initial={false}>
                {d.derniers.map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className="relative flex items-start gap-3 px-1 py-2.5"
                  >
                    <motion.span className="pointer-events-none absolute inset-0 rounded-sm bg-blue-soft" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 2.6, ease: "easeOut" }} aria-hidden />
                    <span className={cn("relative mt-1.5 h-2 w-2 shrink-0 rounded-full", pointTon(tonFait(f.type)))} aria-hidden />
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">{libelleFait(f.type)}</span>
                      <span className="block truncate text-xs text-ink-muted">{f.etablissement ?? "Hors établissement"}</span>
                    </span>
                    <span className="relative shrink-0 text-right text-xs text-ink-muted">
                      <span className="block tabular">{heure(f.enregistreLe)}</span>
                      <span className="block">{ilYa(f.enregistreLe, maintenant)}</span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <EtatVide icone={Radio} titre="Aucun fait aujourd'hui" texte="Faites l'appel dans l'espace enseignant : l'absence apparaîtra ici en moins de 15 secondes, sans ressaisie." />
          )}
          <p className="mt-auto pt-3 text-[11.5px] leading-snug text-ink-muted">Faits anonymes (type, établissement, heure) : aucune donnée individuelle ne remonte au cockpit.</p>
        </>
      ) : null}
    </Card>
  );
}
