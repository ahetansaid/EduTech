"use client";

import { Activity, ArrowRight, Building2, GraduationCap, Radio, School, Sparkles, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BarresClassees, Courbes } from "@/components/charts/Graphiques";
import { CarteBenin, COULEUR_ALERTE, LegendeSequentielle } from "@/components/map/CarteBenin";
import { BadgeConfiance, TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, PageHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { libelleEvenement, nomCommune, useCouches, useIndicateur } from "@/lib/donnees";
import { compact, dateLongue, entier, heure, nombre, pourcent } from "@/lib/format";
import { ANNEE_COURANTE } from "@/lib/sim/macro";
import { DATE_SIMULEE } from "@/lib/sim/micro";
import { priorites, valeursParCommune, type NiveauAlerte } from "@/lib/sim/semantique";
import { communeById, departementById } from "@/lib/sim/territoire";
import { useDemo, useMonde } from "@/lib/store";

type Couche = "priorites" | "maths" | "ratio" | "occupation" | "absenteisme";
const COUCHES: { valeur: Couche; libelle: string }[] = [
  { valeur: "priorites", libelle: "Priorités" },
  { valeur: "maths", libelle: "Maths ≥ 15" },
  { valeur: "ratio", libelle: "Élèves / enseignant" },
  { valeur: "occupation", libelle: "Occupation" },
  { valeur: "absenteisme", libelle: "Absentéisme" },
];
const LIBELLE_ALERTE: Record<NiveauAlerte, string> = { favorable: "Situation favorable", surveillance: "Surveillance", attention: "Attention", critique: "Critique" };

export default function Cockpit() {
  const couches = useCouches();
  const [couche, setCouche] = useState<Couche>("priorites");
  const [commune, setCommune] = useState<string | null>(null);

  const effectif = useIndicateur({ indicateur: "effectif_apprenants", filtres: {}, ventilation: [] });
  const effectifSerie = useIndicateur({ indicateur: "effectif_apprenants", filtres: {}, ventilation: ["annee"] });
  const maths = useIndicateur({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["annee"] });
  const mathsSexe = useIndicateur({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["annee", "sexe"] });
  const mathsDep = useIndicateur({ indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: ["departement"] });
  const ratio = useIndicateur({ indicateur: "ratio_apprenants_enseignant", filtres: {}, ventilation: ["annee"] });
  const bepc = useIndicateur({ indicateur: "taux_reussite_examen", filtres: { niveau: "3e" }, ventilation: ["annee"] });
  const abandon = useIndicateur({ indicateur: "taux_abandon", filtres: {}, ventilation: ["annee"] });

  const prio = useMemo(() => priorites(couches), [couches]);
  const valeurs = useMemo(() => {
    if (couche === "priorites") return undefined;
    const ind = { maths: "taux_seuil_moyenne", ratio: "ratio_apprenants_enseignant", occupation: "taux_occupation", absenteisme: "taux_absenteisme" } as const;
    return valeursParCommune(couches, { indicateur: ind[couche], filtres: couche === "maths" ? { matiere: "Mathématiques", seuil: 15 } : {} });
  }, [couches, couche]);
  const couleurs = useMemo(() => (couche === "priorites" ? new Map([...prio].map(([id, p]) => [id, COULEUR_ALERTE[p.niveau]])) : undefined), [prio, couche]);
  const bornes = valeurs ? [...valeurs.values()].filter((v): v is number => v != null) : [];

  const nbEtablissements = couches.etablissements.length;
  const enseignants = [...couches.communes.values()].reduce((s, c) => s + c.annees[ANNEE_COURANTE].enseignants, 0);
  const critiques = [...prio.entries()].filter(([, p]) => p.niveau === "critique" || p.niveau === "attention").sort((a, b) => b[1].score - a[1].score);
  const serie = (r: typeof maths) => r.lignes.map((l) => l.valeur ?? 0);
  const variation = (r: typeof maths, suffixe = " pt") => {
    const v = serie(r);
    const d = (v[v.length - 1] ?? 0) - (v[v.length - 2] ?? 0);
    return `${d >= 0 ? "+" : ""}${nombre(d, 1)}${suffixe} sur un an`;
  };
  const sel = commune ? prio.get(commune) : null;
  const formater = couche === "ratio" ? (v: number) => nombre(v, 0) : (v: number) => pourcent(v);

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Cockpit national · ${dateLongue(DATE_SIMULEE)}`}
        titre="Situation du système éducatif"
        sousTitre="Chiffres calculés à partir du registre national et du dictionnaire des indicateurs. Chaque valeur porte sa définition, sa source et son indice de confiance."
        actions={
          <>
            <Link href="/ask"><Button variante="secondaire" icone={Sparkles}>Poser une question</Button></Link>
            <Link href="/cockpit/carte"><Button icone={ArrowRight}>Où agir ?</Button></Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={compact(effectif.valeur ?? 0)} tendance={serie(effectifSerie)} variation={{ texte: `+${compact((serie(effectifSerie).at(-1) ?? 0) - (serie(effectifSerie).at(-2) ?? 0))} sur un an`, favorable: true }} confiance={effectif.confiance} />
        <TuileIndicateur libelle="Établissements" icone={School} accent="sarcelle" valeur={entier(nbEtablissements)} indice={`${pourcent((effectif.couverture.etablissementsAyantTransmis / effectif.couverture.etablissementsAttendus) * 100, 0)} ont transmis`} />
        <TuileIndicateur libelle="Enseignants" icone={GraduationCap} accent="bleu" valeur={compact(enseignants)} tendance={serie(ratio).map((v) => -v)} indice={<span>{nombre(ratio.valeur, 1)} élèves par enseignant</span>} confiance={ratio.confiance} />
        <TuileIndicateur libelle="Réussite au BEPC" icone={Building2} accent="ambre" valeur={nombre(bepc.valeur, 1)} unite="%" tendance={serie(bepc)} variation={{ texte: variation(bepc), favorable: true }} confiance={bepc.confiance} />
        <TuileIndicateur libelle="Maths ≥ 15/20" icone={Activity} accent="sarcelle" valeur={nombre(maths.valeur, 1)} unite="%" tendance={serie(maths)} variation={{ texte: variation(maths), favorable: true }} confiance={maths.confiance} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Carte des 77 communes</h2>
              <p className="text-[12.5px] text-ink-muted">Cliquez sur une commune pour comprendre sa situation.</p>
            </div>
            <Segmente label="Couche affichée" options={COUCHES} valeur={couche} onChange={(v) => { setCouche(v); }} />
          </div>
          <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
            <CarteBenin
              valeurs={valeurs}
              couleurs={couleurs}
              selection={commune}
              onSelect={(id) => setCommune((c) => (c === id ? null : id))}
              formater={formater}
              libelleValeur={COUCHES.find((c) => c.valeur === couche)?.libelle}
              hauteur={600}
              className="mx-auto w-full max-w-[420px]"
              legende={valeurs && bornes.length ? <LegendeSequentielle min={Math.min(...bornes)} max={Math.max(...bornes)} libelle={COUCHES.find((c) => c.valeur === couche)!.libelle} formater={formater} /> : (
                <div className="mt-2 flex flex-wrap gap-3 text-[11.5px] text-ink-2">
                  {(Object.keys(COULEUR_ALERTE) as NiveauAlerte[]).map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COULEUR_ALERTE[n] }} />{LIBELLE_ALERTE[n]}</span>
                  ))}
                </div>
              )}
            />
            <div className="min-w-0">
              {sel && commune ? (
                <div className="animate-fade-in">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{departementById.get(communeById.get(commune)!.departementId)?.nom}</p>
                  <p className="font-display text-[20px] font-bold text-ink">{nomCommune(commune)}</p>
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[12px] font-semibold text-white" style={{ background: COULEUR_ALERTE[sel.niveau] }}>{LIBELLE_ALERTE[sel.niveau]}</span>
                  <p className="mt-4 text-[12px] font-semibold text-ink-2">Pourquoi ?</p>
                  <ul className="mt-2 space-y-2">
                    {sel.facteurs.map((f) => (
                      <li key={f.libelle} className={cn("rounded-md px-3 py-2 text-[12.5px]", f.grave ? "bg-critical-bg" : "bg-surface-2")}>
                        <span className="block text-ink-2">{f.libelle}</span>
                        <span className={cn("font-semibold tabular", f.grave ? "text-critical" : "text-ink")}>{f.valeur}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/cockpit/carte?commune=${commune}`} className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-blue hover:underline">Descendre jusqu'aux établissements <ArrowRight size={14} /></Link>
                </div>
              ) : (
                <div>
                  <p className="text-[12px] font-semibold text-ink-2">Zones à examiner en priorité</p>
                  <ul className="mt-2 space-y-1">
                    {critiques.slice(0, 9).map(([id, p]) => (
                      <li key={id}>
                        <button onClick={() => setCommune(id)} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: COULEUR_ALERTE[p.niveau] }} aria-hidden />
                          <span className="flex-1 truncate text-[13px] text-ink">{nomCommune(id)}</span>
                          <span className="text-[11.5px] text-ink-muted">{p.score} facteur{p.score > 1 ? "s" : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Chaque couleur s'explique : un niveau résulte du nombre de facteurs dépassant leur seuil (croissance, occupation, encadrement, absentéisme, résultats).</p>
                </div>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={Activity} title="Mathématiques ≥ 15/20, par sexe" subtitle="Proportion des apprenants évalués, 2021-2022 à 2025-2026" action={<BadgeConfiance confiance={mathsSexe.confiance} />} />
            <Courbes
              formater={(v) => pourcent(v)}
              series={(["F", "M"] as const).map((s) => ({
                nom: s === "F" ? "Filles" : "Garçons",
                points: mathsSexe.lignes.filter((l) => l.cle.endsWith(`¦${s}`)).map((l) => ({ x: l.cle.split("¦")[0]!.replace("-20", "-"), y: l.valeur })),
              }))}
            />
            <p className="mt-2 text-[12px] text-ink-muted">Écart en faveur des filles : +{nombre((mathsSexe.lignes.at(-2)?.valeur ?? 0) - (mathsSexe.lignes.at(-1)?.valeur ?? 0), 1)} point en 2025-2026. Corrélation n'est pas causalité : ce constat appelle une évaluation, pas une conclusion.</p>
          </Card>
          <FluxDirect />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={TriangleAlert} title="Mathématiques ≥ 15/20 par département" subtitle={`Année ${ANNEE_COURANTE} · référence nationale : ${pourcent(maths.valeur)}`} action={<BadgeConfiance confiance={mathsDep.confiance} />} />
          <BarresClassees barres={mathsDep.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.valeur, effectif: l.effectif }))} formater={(v) => pourcent(v)} reference={{ valeur: maths.valeur ?? 0, libelle: "Moyenne nationale" }} />
        </Card>
        <Card>
          <CardHeader icon={Users} title="Abandon scolaire" subtitle="Part des inscrits ayant quitté le système sans transfert" action={<BadgeConfiance confiance={abandon.confiance} />} />
          <Courbes formater={(v) => pourcent(v)} min={0} series={[{ nom: "Taux d'abandon", points: abandon.lignes.map((l) => ({ x: l.cle.replace("-20", "-"), y: l.valeur })) }]} hauteur={210} />
          <p className="mt-2 text-[12.5px] text-ink-2">En baisse de {nombre((abandon.lignes[0]?.valeur ?? 0) - (abandon.valeur ?? 0), 1)} point depuis 2021-2022. Indicateur annuel : la valeur 2025-2026 reste provisoire jusqu'à la validation de fin d'année.</p>
        </Card>
      </div>
    </div>
  );
}

function FluxDirect() {
  const monde = useMonde();
  const live = useDemo((s) => s.evenementsLive);
  const recents = [...live].reverse().slice(0, 6);
  const etab = (id: string | null) => monde.etablissements.find((e) => e.id === id)?.nom ?? "—";
  return (
    <Card>
      <CardHeader icon={Radio} title="Flux en direct" subtitle="Événements enregistrés pendant la séance (établissements pilotes)" action={<Badge ton={recents.length ? "succes" : "neutre"}>{live.length} aujourd'hui</Badge>} />
      {recents.length ? (
        <ul className="space-y-2">
          {recents.map((e) => (
            <li key={e.id} className="flex animate-slide-up items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2 text-[12.5px]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-success animate-pulse-soft" aria-hidden />
              <span className="font-semibold text-ink">{libelleEvenement(e.type)}</span>
              <span className="flex-1 truncate text-ink-2">{etab(e.etablissementId)}</span>
              <span className="tabular text-ink-muted">{heure(e.enregistreLe)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md bg-surface-2/70 px-3 py-4 text-center text-[12.5px] text-ink-muted">
          Aucun événement depuis l'ouverture de la séance. Faites l'appel dans l'espace enseignant : il apparaîtra ici, sans ressaisie.
        </p>
      )}
    </Card>
  );
}
