"use client";

import type { Apprenant, Matiere, NouvelEvenement } from "@beile/contracts";
import { ArrowLeft, Check, CloudOff, Database, PenLine, Save, UserX } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useMemo, useState } from "react";
import { Sparkline } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, nombre } from "@/lib/format";
import { absences, absentsDuJour, AUJOURDHUI, elevesClasse, moyennesParMatiere, nomComplet } from "@/lib/scolarite";
import { ANNEE } from "@beile/simulation/micro";
import { notesApprenant, notesEffectives } from "@beile/simulation/projections";
import { maintenant, useDemo, useMonde, useProfil } from "@/lib/store";
import { apiActive, appelApi } from "@/lib/api";

type Onglet = "appel" | "notes" | "eleves";

function PageClasse({ id }: { id: string }) {
  const params = useSearchParams();
  const monde = useMonde();
  const profil = useProfil();
  const [onglet, setOnglet] = useState<Onglet>((params.get("onglet") as Onglet) ?? "appel");
  const classe = monde.classes.find((c) => c.id === id);
  const enseignant = monde.enseignants.find((e) => e.npi === profil.npi);
  const matieres = monde.enseignements.filter((e) => e.classeId === id && e.enseignantId === enseignant?.id).map((e) => e.matiere);
  const eleves = useMemo(() => (classe ? elevesClasse(monde, monde.evenements, classe) : []), [monde, classe]);

  if (!classe || !enseignant) return <Card>Classe introuvable.</Card>;
  if (!matieres.length) return <Card>Vous n'enseignez pas dans cette classe : aucune relation pédagogique, accès refusé.</Card>;

  return (
    <div className="space-y-6">
      <Link href="/enseignant" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} /> Mes classes</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-ink-muted">CEG Les Rôniers · {matieres.join(", ")} · {eleves.length} élèves</p>
          <h1 className="mt-1 font-display text-[28px] font-bold text-ink">{classe.libelle}</h1>
        </div>
        <Segmente label="Section" valeur={onglet} onChange={setOnglet} options={[{ valeur: "appel", libelle: "Appel" }, { valeur: "notes", libelle: "Notes" }, { valeur: "eleves", libelle: "Élèves" }]} />
      </div>
      {onglet === "appel" && <Appel classeId={id} eleves={eleves} enseignantId={enseignant.id} />}
      {onglet === "notes" && <Notes classeId={id} eleves={eleves} enseignantId={enseignant.id} matieres={matieres} />}
      {onglet === "eleves" && <Eleves eleves={eleves} matiere={matieres[0]!} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Appel */

function Appel({ classeId, eleves, enseignantId }: { classeId: string; eleves: Apprenant[]; enseignantId: string }) {
  const monde = useMonde();
  const enregistrer = useDemo((s) => s.enregistrer);
  const enLigne = useDemo((s) => s.enLigne);
  const fileAttente = useDemo((s) => s.fileAttente);
  const enAttente = fileAttente.filter((e) => e.type === "ABSENCE" && e.classeId === classeId && e.date === AUJOURDHUI);
  const dejaAbsents = new Set([...absentsDuJour(monde.evenements, classeId), ...enAttente].map((e) => ("apprenantId" in e ? e.apprenantId : "")));
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [bilan, setBilan] = useState<{ n: number; horsLigne: boolean } | null>(null);
  const [base, setBase] = useState<{ etat: "envoi" | "ok" | "refus" | "erreur"; detail: string } | null>(null);
  const profil = useProfil();
  const appelFait = dejaAbsents.size > 0 || bilan != null;

  const basculer = (id: string) => setAbsents((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const valider = () => {
    const evts: NouvelEvenement[] = [...absents].map((apprenantId) => ({
      type: "ABSENCE", apprenantId, classeId, date: AUJOURDHUI, justifiee: false, anneeScolaire: ANNEE,
      survenuLe: maintenant(), auteurId: enseignantId, source: "beile", etablissementId: monde.classes.find((c) => c.id === classeId)!.etablissementId,
    }));
    enregistrer(evts);
    setBilan({ n: evts.length, horsLigne: !enLigne });
    // Base nationale : l'API vérifie la relation pédagogique côté serveur, puis écrit au registre.
    if (apiActive && enLigne) {
      setBase({ etat: "envoi", detail: "" });
      appelApi<{ enregistres?: string[]; erreur?: string }>(profil.id, "POST", "/evenements/absences", { classeId, date: AUJOURDHUI, apprenantIds: [...absents] })
        .then((r) => setBase(r.statut === 201 ? { etat: "ok", detail: `${r.donnees.enregistres?.length ?? 0} événement(s) inscrit(s) au registre national` } : { etat: "refus", detail: r.donnees.erreur ?? `Refus ${r.statut}` }))
        .catch((e: Error) => setBase({ etat: "erreur", detail: e.message }));
    }
    setAbsents(new Set());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-line/60 px-5 py-3.5">
          <p className="text-[14px] font-semibold text-ink">Appel du {date(AUJOURDHUI)} · 1re heure</p>
          <p className="text-[13px] text-ink-muted"><span className="font-semibold tabular text-ink">{eleves.length - absents.size - dejaAbsents.size}</span> présents · <span className="font-semibold tabular text-critical">{absents.size + dejaAbsents.size}</span> absents</p>
        </div>
        <ul className="divide-y divide-line/50">
          {eleves.map((e, i) => {
            const deja = dejaAbsents.has(e.id);
            const absent = deja || absents.has(e.id);
            return (
              <li key={e.id} className="animate-row" style={{ animationDelay: `${Math.min(i, 25) * 12}ms` }}>
                <button
                  disabled={deja}
                  onClick={() => basculer(e.id)}
                  aria-pressed={absent}
                  className={cn("flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors", absent ? "bg-critical-bg/60" : "hover:bg-surface-2/70", deja && "cursor-default")}
                >
                  <span className="w-6 text-right text-[12px] tabular text-ink-muted">{i + 1}</span>
                  <span className="flex-1 text-[14px] text-ink"><span className="font-semibold">{e.nom}</span> {e.prenoms}</span>
                  {e.statutIdentite === "regularisation_en_cours" && <Badge ton="avertissement">Identité en régularisation</Badge>}
                  <span className={cn("inline-flex h-8 min-w-24 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-semibold", absent ? "bg-critical text-white" : "bg-success-bg text-success")}>
                    {absent ? <UserX size={14} aria-hidden /> : <Check size={14} aria-hidden />} {absent ? (deja ? "Absent · enregistré" : "Absent") : "Présent"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <p className="text-[14px] font-semibold text-ink">Valider l'appel</p>
          <p className="mt-1 text-[13px] text-ink-2">Touchez un élève pour le marquer absent. À la validation, chaque absence est enregistrée une seule fois dans le registre.</p>
          <Button className="mt-4 w-full" variante="valider" icone={Save} disabled={absents.size === 0} onClick={valider}>
            Enregistrer {absents.size || ""} absence{absents.size > 1 ? "s" : ""}
          </Button>
          {!enLigne && <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-[12.5px] text-warning"><CloudOff size={15} className="mt-0.5 shrink-0" /> Hors connexion : l'appel est conservé sur l'appareil et sera synchronisé automatiquement au retour du réseau.</p>}
        </Card>
        {bilan && (
          <Card className="animate-slide-up border-success/30">
            <p className="text-[14px] font-semibold text-success">{bilan.horsLigne ? `${bilan.n} absence(s) en attente de synchronisation` : `${bilan.n} absence(s) enregistrée(s)`}</p>
            {bilan.horsLigne ? (
              <p className="mt-1 text-[13px] text-ink-2">Rétablissez la connexion (bouton en haut de l'écran) : la synchronisation se fait sans action de votre part, sans doublon.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-[13px] text-ink-2">
                <li>• Les familles ont reçu une notification nominative.</li>
                <li>• La directrice voit la liste du jour.</li>
                <li>• L'inspecteur voit le taux d'absence de l'établissement.</li>
                <li>• Le cockpit national reçoit l'événement dans son flux.</li>
              </ul>
            )}
            {base && (
              <p className={cn("mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[12.5px] font-medium", base.etat === "ok" ? "bg-success-bg text-success" : base.etat === "envoi" ? "bg-info-bg text-info" : "bg-critical-bg text-critical")}>
                <Database size={14} aria-hidden /> {base.etat === "envoi" ? "Écriture dans la base nationale…" : `Base nationale : ${base.detail}`}
              </p>
            )}
            <p className="mt-3 text-[12px] text-ink-muted">Un fait, saisi une fois, restitué à quatre niveaux.</p>
          </Card>
        )}
        {appelFait && !bilan && <p className="text-[12.5px] text-ink-muted">Des absences ont déjà été enregistrées aujourd'hui pour cette classe ; vous pouvez en ajouter.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Notes */

function Notes({ classeId, eleves, enseignantId, matieres }: { classeId: string; eleves: Apprenant[]; enseignantId: string; matieres: Matiere[] }) {
  const monde = useMonde();
  const enregistrer = useDemo((s) => s.enregistrer);
  const [matiere, setMatiere] = useState<Matiere>(matieres[0]!);
  const [saisies, setSaisies] = useState<Record<string, string>>({});
  const [ok, setOk] = useState<number | null>(null);
  const [correction, setCorrection] = useState<{ evtId: string; apprenantId: string; nom: string; ancienne: number } | null>(null);
  const [nouvelle, setNouvelle] = useState("");
  const [motif, setMotif] = useState("");
  const etablissementId = monde.classes.find((c) => c.id === classeId)!.etablissementId;

  const erreurs = Object.fromEntries(Object.entries(saisies).filter(([, v]) => v !== "").map(([k, v]) => {
    const n = Number(v.replace(",", "."));
    return [k, Number.isNaN(n) || n < 0 || n > 20 ? "Note entre 0 et 20" : Math.round(n * 4) !== n * 4 ? "Par quart de point" : null];
  }).filter(([, e]) => e));
  const valides = Object.entries(saisies).filter(([k, v]) => v !== "" && !erreurs[k]);

  const enregistrerNotes = () => {
    const evts: NouvelEvenement[] = valides.map(([apprenantId, v]) => ({
      type: "EVALUATION", apprenantId, classeId, matiere, note: Number(v.replace(",", ".")), trimestre: 2, anneeScolaire: ANNEE,
      survenuLe: maintenant(), auteurId: enseignantId, source: "beile", etablissementId,
    }));
    enregistrer(evts);
    setOk(evts.length);
    setSaisies({});
  };

  const historique = useMemo(() => {
    const notes = notesEffectives(monde.evenements).filter((e) => e.classeId === classeId && e.matiere === matiere);
    const parDate = new Map<string, typeof notes>();
    for (const n of notes) parDate.set(n.survenuLe.slice(0, 10), [...(parDate.get(n.survenuLe.slice(0, 10)) ?? []), n]);
    return [...parDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [monde, classeId, matiere]);

  return (
    <div className="space-y-6">
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-3.5">
          <p className="text-[14px] font-semibold text-ink">Nouvelle évaluation · {date(AUJOURDHUI)} · 2e trimestre</p>
          {matieres.length > 1 && <Segmente label="Matière" valeur={matiere} onChange={setMatiere} options={matieres.map((m) => ({ valeur: m, libelle: m }))} />}
        </div>
        <ul className="grid divide-y divide-line/50 sm:grid-cols-2 sm:divide-y-0">
          {eleves.map((e) => (
            <li key={e.id} className="flex items-center gap-3 border-line/50 px-5 py-2 sm:border-b">
              <label htmlFor={`n-${e.id}`} className="flex-1 truncate text-[13.5px] text-ink"><span className="font-semibold">{e.nom}</span> {e.prenoms}</label>
              <div className="text-right">
                <input
                  id={`n-${e.id}`}
                  inputMode="decimal"
                  value={saisies[e.id] ?? ""}
                  onChange={(ev) => setSaisies((s) => ({ ...s, [e.id]: ev.target.value.replace(/[^0-9.,]/g, "").slice(0, 5) }))}
                  aria-invalid={!!erreurs[e.id]}
                  aria-describedby={erreurs[e.id] ? `err-${e.id}` : undefined}
                  className={cn("h-9 w-20 rounded-md border bg-surface px-2 text-right text-[14px] tabular text-ink outline-none focus:ring-2 focus:ring-blue/40", erreurs[e.id] ? "border-critical" : "border-line")}
                  placeholder="/20"
                />
                {erreurs[e.id] && <p id={`err-${e.id}`} className="mt-0.5 text-[11px] text-critical">{erreurs[e.id]}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 px-5 py-3.5">
          <p className="text-[13px] text-ink-muted">{valides.length} note{valides.length > 1 ? "s" : ""} prête{valides.length > 1 ? "s" : ""} · le bulletin se met à jour automatiquement</p>
          <Button variante="valider" icone={Save} disabled={!valides.length || Object.keys(erreurs).length > 0} onClick={enregistrerNotes}>Enregistrer les notes</Button>
        </div>
      </Card>
      {ok != null && <p className="animate-slide-up rounded-md bg-success-bg px-4 py-3 text-[13px] font-medium text-success">{ok} note(s) enregistrée(s) dans le registre. Les familles sont informées ; les moyennes et bulletins sont recalculés.</p>}

      <Card>
        <CardHeader icon={PenLine} title={`Évaluations précédentes · ${matiere}`} subtitle="Une note enregistrée n'est jamais effacée : une correction crée un nouvel événement, avec son auteur et son motif." />
        <div className="space-y-4">
          {historique.slice(0, 4).map(([jour, notes]) => (
            <div key={jour}>
              <p className="mb-2 text-[12.5px] font-semibold text-ink-2">{date(jour)} · moyenne {nombre(notes.reduce((s, n) => s + n.note, 0) / notes.length, 2)}/20 · {notes.length} copies</p>
              <div className="flex flex-wrap gap-1.5">
                {notes.slice(0, 60).map((n) => {
                  const a = eleves.find((x) => x.id === n.apprenantId);
                  return (
                    <button key={n.id} onClick={() => { setCorrection({ evtId: n.id, apprenantId: n.apprenantId, nom: a ? nomComplet(a) : n.apprenantId, ancienne: n.note }); setNouvelle(""); setMotif(""); }} title={`${a ? nomComplet(a) : ""} — corriger`} className={cn("rounded-sm px-1.5 py-0.5 text-[11.5px] font-medium tabular", n.corrigee ? "bg-info-bg text-info ring-1 ring-info/40" : n.note < 10 ? "bg-critical-bg text-critical" : "bg-surface-2 text-ink-2", "hover:ring-1 hover:ring-blue")}>
                      {nombre(n.note, n.note % 1 ? 2 : 0)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {correction && (
          <div className="mt-5 animate-slide-up rounded-lg border border-line/70 bg-surface-2/50 p-4">
            <p className="text-[13.5px] font-semibold text-ink">Corriger la note de {correction.nom} (actuellement {correction.ancienne}/20)</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-[8rem_1fr_auto]">
              <input value={nouvelle} onChange={(e) => setNouvelle(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 5))} placeholder="Nouvelle note" aria-label="Nouvelle note" className="h-10 rounded-md border border-line bg-surface px-3 text-[14px] tabular" />
              <input value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 140))} placeholder="Motif obligatoire (ex. erreur de report)" aria-label="Motif de la correction" className="h-10 rounded-md border border-line bg-surface px-3 text-[14px]" />
              <Button
                disabled={!motif.trim() || Number.isNaN(Number(nouvelle.replace(",", "."))) || nouvelle === "" || Number(nouvelle.replace(",", ".")) > 20}
                onClick={() => {
                  enregistrer([{ type: "CORRECTION_EVALUATION", apprenantId: correction.apprenantId, evenementCorrigeId: correction.evtId, nouvelleNote: Number(nouvelle.replace(",", ".")), motif: motif.trim(), survenuLe: maintenant(), auteurId: enseignantId, source: "beile", etablissementId }]);
                  setCorrection(null);
                }}
              >Corriger</Button>
            </div>
            <p className="mt-2 text-[12px] text-ink-muted">La note d'origine reste dans le registre ; la correction est tracée avec son auteur, son horodatage et son motif.</p>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Élèves */

function Eleves({ eleves, matiere }: { eleves: Apprenant[]; matiere: Matiere }) {
  const monde = useMonde();
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line/50">
        {eleves.map((e) => {
          const notes = notesApprenant(monde.evenements, e.id).filter((n) => n.matiere === matiere).sort((a, b) => a.survenuLe.localeCompare(b.survenuLe)).map((n) => n.note);
          const moy = moyennesParMatiere(monde.evenements, e.id).find((m) => m.matiere === matiere)?.moyenne ?? null;
          const baisse = notes.length >= 3 && notes.at(-3)! - notes.at(-1)! >= 5;
          return (
            <li key={e.id} className="flex items-center gap-4 px-5 py-2.5">
              <span className="flex-1 truncate text-[14px] text-ink"><span className="font-semibold">{e.nom}</span> {e.prenoms}</span>
              {baisse && <Badge ton="avertissement">En baisse</Badge>}
              <span className="hidden text-[12px] text-ink-muted sm:inline">{absences(monde.evenements, e.id).length} abs.</span>
              <Sparkline points={notes} className={baisse ? "text-warning" : "text-blue"} />
              <span className="w-16 text-right text-[14px] font-semibold tabular text-ink">{nombre(moy, 2)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><PageClasse id={id} /></Suspense>;
}
