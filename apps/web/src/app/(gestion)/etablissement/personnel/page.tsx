"use client";

import { BadgeCheck, CircleAlert, GraduationCap, Search, Star, UserX, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { Badge, Card, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { usePersonnel, type MembrePersonnel } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";
import { useEtablissementCourant } from "@/lib/session";
import { EtatErreur } from "../_composants";

/**
 * Personnel enseignant : qui enseigne quoi, à combien d'élèves, avec quelles formations, et où les notes
 * du trimestre manquent. L'activité se lit par classe et matière (le registre ne rattache pas une note à
 * la personne qui l'a saisie) : on signale une classe sans note, jamais une personne « inactive ».
 */

type Filtre = "tous" | "attention" | "sans-formation";

export default function PagePersonnel() {
  const id = useEtablissementCourant();
  const q = usePersonnel(id);
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [recherche, setRecherche] = useState("");

  const p = q.data;
  const synthese = useMemo(() => {
    if (!p) return null;
    const l = p.personnel;
    const sansService = l.filter((m) => !m.classes.length);
    const sansFormation = l.filter((m) => !m.formationObligatoire);
    const sansNote = l.flatMap((m) => m.classes.filter((c) => c.effectif > 0 && c.notesTrimestre === 0).map((c) => ({ ...c, enseignant: `${m.prenoms} ${m.nom}` })));
    const actifs = l.filter((m) => m.classes.length);
    return {
      total: l.length,
      femmes: l.filter((m) => m.sexe === "F").length,
      charge: actifs.length ? actifs.reduce((s, m) => s + m.eleves, 0) / actifs.length : null,
      sansService, sansFormation, sansNote,
    };
  }, [p]);

  const visibles = useMemo(() => {
    const t = recherche.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return (p?.personnel ?? []).filter((m) => {
      if (filtre === "sans-formation" && m.formationObligatoire) return false;
      if (filtre === "attention" && m.classes.length && !m.classes.some((c) => c.effectif > 0 && c.notesTrimestre === 0)) return false;
      if (!t) return true;
      return `${m.prenoms} ${m.nom} ${m.matieres.join(" ")}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t);
    });
  }, [p, filtre, recherche]);

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre="Mon établissement" titre="Personnel enseignant" />
        {q.isError ? <Card><EtatErreur erreur={q.error} reessayer={() => q.refetch()} /></Card>
          : !p || !synthese ? (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-20 rounded-xl" />)}</div>
              <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-40 rounded-2xl" />)}</div>
            </>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Chiffre libelle="Enseignants" valeur={entier(synthese.total)} detail={`${synthese.femmes} femme${synthese.femmes > 1 ? "s" : ""}`} icone={Users} />
                <Chiffre libelle="Élèves en charge" valeur={nombre(synthese.charge, 0)} detail="en moyenne, par enseignant en service" icone={GraduationCap} />
                <Chiffre libelle="Sans formation obligatoire" valeur={entier(synthese.sansFormation.length)} detail={p.formationObligatoire} icone={BadgeCheck} alerte={synthese.sansFormation.length > 0} />
                <Chiffre libelle="Classes sans note" valeur={entier(synthese.sansNote.length)} detail={`trimestre ${p.trimestre}, par matière`} icone={CircleAlert} alerte={synthese.sansNote.length > 0} />
              </dl>

              {(synthese.sansService.length > 0 || synthese.sansNote.length > 0) && (
                <Card className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">À surveiller</p>
                  <ul className="mt-3 space-y-2 text-[14px]">
                    {synthese.sansService.map((m) => (
                      <li key={m.id} className="flex items-start gap-2.5"><UserX size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden /> <span><strong className="font-semibold">{m.prenoms} {m.nom}</strong> n&apos;a aucune classe attribuée cette année.</span></li>
                    ))}
                    {synthese.sansNote.slice(0, 8).map((c) => (
                      <li key={`${c.classeId}-${c.matiere}`} className="flex items-start gap-2.5"><CircleAlert size={16} className="mt-0.5 shrink-0 text-critical" aria-hidden /> <span><strong className="font-semibold">{c.classe}, {c.matiere}</strong> : aucune note ce trimestre ({c.enseignant}).</span></li>
                    ))}
                    {synthese.sansNote.length > 8 && <li className="pl-6 text-[13px] text-ink-muted">et {synthese.sansNote.length - 8} autre{synthese.sansNote.length - 8 > 1 ? "s" : ""}…</li>}
                  </ul>
                </Card>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Segmente label="Filtre" valeur={filtre} onChange={(v) => setFiltre(v as Filtre)}
                  options={[{ valeur: "tous", libelle: "Tous" }, { valeur: "attention", libelle: "À surveiller" }, { valeur: "sans-formation", libelle: "Sans formation" }]} />
                <label className="relative block sm:w-72">
                  <span className="sr-only">Rechercher un enseignant ou une matière</span>
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
                  <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou matière"
                    className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-[14px] text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
                  {recherche && <button type="button" onClick={() => setRecherche("")} className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2" aria-label="Effacer"><X size={14} /></button>}
                </label>
              </div>

              {visibles.length === 0 ? (
                <Card><EtatVide icone={Users} titre="Aucun enseignant ne correspond" texte="Changez de filtre ou de recherche." /></Card>
              ) : (
                <Cascade className="grid gap-3 md:grid-cols-2">
                  {visibles.map((m) => <Element key={m.id}><CarteEnseignant m={m} /></Element>)}
                </Cascade>
              )}
            </>
          )}
      </div>
    </EntreePage>
  );
}

function Chiffre({ libelle, valeur, detail, icone: Icone, alerte = false }: { libelle: string; valeur: string; detail?: string; icone: typeof Users; alerte?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line/70 bg-surface p-3.5 shadow-float">
      <dt className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted"><span className="truncate">{libelle}</span><Icone size={15} className={alerte ? "text-critical" : "text-ink-muted"} aria-hidden /></dt>
      <dd className={cn("mt-1.5 text-[22px] font-semibold tabular-nums", alerte ? "text-critical" : "text-ink")}>{valeur}</dd>
      {detail && <dd className="truncate text-[12px] text-ink-muted" title={detail}>{detail}</dd>}
    </div>
  );
}

function CarteEnseignant({ m }: { m: MembrePersonnel }) {
  const initiales = `${m.prenoms[0] ?? ""}${m.nom[0] ?? ""}`;
  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-line/70 bg-surface p-4 shadow-float">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-soft font-display text-[15px] font-bold text-accent-ink">{initiales}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{m.prenoms} {m.nom}</p>
          <p className="truncate text-[12.5px] text-ink-muted">{[m.grade, m.anciennete != null ? `${m.anciennete} an${m.anciennete > 1 ? "s" : ""} de service` : null].filter(Boolean).join(" · ")}</p>
        </div>
        {m.formationObligatoire
          ? <Badge ton="succes" icone={BadgeCheck}>Formé</Badge>
          : <Badge ton="avertissement">Formation à planifier</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">{m.matieres.map((x) => <Badge key={x} ton="neutre">{x}</Badge>)}</div>
      {m.classes.length === 0 ? (
        <p className="mt-3 rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning">Aucune classe attribuée cette année.</p>
      ) : (
        <>
          <p className="mt-3 text-[12.5px] text-ink-muted"><strong className="font-semibold text-ink">{entier(m.eleves)}</strong> élèves · {new Set(m.classes.map((c) => c.classeId)).size} classe{new Set(m.classes.map((c) => c.classeId)).size > 1 ? "s" : ""}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Classes et matières tenues">
            {m.classes.map((c) => (
              <li key={`${c.classeId}-${c.matiere}`} title={c.derniereNote ? `Dernière note le ${new Date(c.derniereNote).toLocaleDateString("fr-FR")}` : "Aucune note ce trimestre"}
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px]", c.notesTrimestre === 0 && c.effectif > 0 ? "bg-critical-bg text-critical" : "bg-surface-2 text-ink-2")}>
                {c.principal && <Star size={11} aria-label="Professeur principal" />}
                <span className="font-semibold">{c.classe}</span> {c.matiere} · {c.notesTrimestre} note{c.notesTrimestre > 1 ? "s" : ""}
              </li>
            ))}
          </ul>
        </>
      )}
      {m.formations.length > 0 && (
        <p className="mt-auto pt-3 text-[12px] text-ink-muted">Dernière formation : {m.formations[0]!.intitule} ({new Date(m.formations[0]!.le).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })})</p>
      )}
    </article>
  );
}
