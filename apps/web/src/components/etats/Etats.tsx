"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button, Segmente } from "@/components/ui/primitives";
import type { EleveLigne } from "@/lib/api/etablissement";
import { date, nombre } from "@/lib/format";

/**
 * États imprimables de l'établissement : état nominatif, feuille d'appel, procès-verbal de conseil.
 * Rendus dans <body> (attribut `data-impression`) comme le bulletin : à l'impression, la feuille de
 * style globale ne conserve que ce document. Le navigateur produit le PDF (« Enregistrer en PDF »).
 * Tout est dérivé de la liste des apprenants déjà chargée à l'écran — aucune nouvelle source de données.
 */

export type GenreEtat = "nominatif" | "appel" | "pv";

const GENRES: { valeur: GenreEtat; libelle: string }[] = [
  { valeur: "nominatif", libelle: "État nominatif" },
  { valeur: "appel", libelle: "Feuille d'appel" },
  { valeur: "pv", libelle: "PV de conseil" },
];

export interface MetaEtat { etablissement: string; classe: string; trimestre: number; dateJour: string }

export function FeuilleImprimable({ eleves, meta, onFermer }: { eleves: EleveLigne[]; meta: MetaEtat; onFermer: () => void }) {
  const monte = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [genre, setGenre] = useState<GenreEtat>("nominatif");

  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", echap); document.body.style.overflow = avant; };
  }, [onFermer]);

  if (!monte) return null;

  return createPortal(
    <div data-impression className="fixed inset-0 z-[80] overflow-y-auto bg-navy-deep/50 backdrop-blur-sm print:static print:overflow-visible print:bg-white print:backdrop-blur-none">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-3 p-0 sm:p-6 print:block print:max-w-none print:gap-0 print:p-0">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-surface/95 px-4 py-3 shadow-soft backdrop-blur sm:rounded-t-xl print:hidden">
          <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1">
            <Segmente label="Type d'état" valeur={genre} onChange={(v) => setGenre(v as GenreEtat)} options={GENRES} />
          </div>
          <div className="flex items-center gap-2">
            <Button variante="secondaire" taille="sm" icone={Printer} onClick={() => window.print()}>Imprimer / PDF</Button>
            <Button variante="fantome" taille="sm" icone={X} onClick={onFermer} aria-label="Fermer l'état" />
          </div>
        </div>

        {genre === "nominatif" && <EtatNominatif eleves={eleves} meta={meta} />}
        {genre === "appel" && <FeuilleAppel eleves={eleves} meta={meta} />}
        {genre === "pv" && <PvConseil eleves={eleves} meta={meta} />}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ En-tête commun aux documents */

function Tete({ titre, meta, sousTitre }: { titre: string; meta: MetaEtat; sousTitre: string }) {
  return (
    <header className="border-b-2 border-slate-900 pb-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Plateforme éducative BEILE · {meta.etablissement || "Établissement"}</p>
      <h1 className="mt-1 font-display text-[21px] font-bold leading-tight text-slate-900">{titre}</h1>
      <p className="mt-0.5 text-[13px] text-slate-600">{sousTitre}</p>
      <p className="mt-0.5 text-[12px] text-slate-500">Classe : {meta.classe} · T{meta.trimestre} · édité le {date(meta.dateJour)}</p>
    </header>
  );
}

const Pied = ({ note }: { note: string }) => (
  <footer className="mt-6 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
    <p>{note}</p>
    <p className="mt-2 text-slate-400">BEILE · document de travail — la valeur officielle reste le dossier tenu par l'établissement.</p>
  </footer>
);

const Cadre = ({ children }: { children: React.ReactNode }) => (
  <article data-impression-doc className="mx-auto w-full bg-white px-6 py-7 text-slate-900 shadow-pop sm:rounded-xl print:mx-0 print:w-full print:px-0 print:py-0 print:shadow-none sm:print:rounded-none">
    {children}
  </article>
);

/** Regroupe par classe, dans l'ordre alphabétique des divisions, pour qu'une feuille reste une feuille. */
function parClasse(eleves: EleveLigne[]): [string, EleveLigne[]][] {
  const m = new Map<string, EleveLigne[]>();
  for (const e of eleves) m.set(e.classe, [...(m.get(e.classe) ?? []), e]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr"));
}

/* ------------------------------------------------------------------ État nominatif */

function EtatNominatif({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  return (
    <Cadre>
      <Tete titre="État nominatif des apprenants" meta={meta} sousTitre="Liste nominative arrêtée à la date d'édition." />
      <table className="mt-4 w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-2 font-semibold">N°</th>
            <th className="py-1.5 pr-2 font-semibold">Nom</th>
            <th className="py-1.5 pr-2 font-semibold">Prénoms</th>
            <th className="py-1.5 pr-2 font-semibold">Sexe</th>
            <th className="py-1.5 pr-2 font-semibold">Date de naissance</th>
            <th className="py-1.5 pr-2 font-semibold">Classe</th>
            <th className="py-1.5 text-right font-semibold">Moyenne</th>
          </tr>
        </thead>
        <tbody>
          {eleves.map((e, i) => (
            <tr key={e.id} className="border-b border-slate-100">
              <td className="py-1.5 pr-2 tabular-nums text-slate-400">{i + 1}</td>
              <td className="py-1.5 pr-2 uppercase text-slate-800">{e.nom}</td>
              <td className="py-1.5 pr-2 text-slate-800">{e.prenoms}</td>
              <td className="py-1.5 pr-2 text-slate-600">{e.sexe}</td>
              <td className="py-1.5 pr-2 tabular-nums text-slate-600">{date(e.dateNaissance)}</td>
              <td className="py-1.5 pr-2 text-slate-600">{e.classe}</td>
              <td className="py-1.5 text-right tabular-nums text-slate-800">{e.moyenne != null ? nombre(e.moyenne, 2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[13px] font-semibold text-slate-700">{eleves.length} apprenant{eleves.length > 1 ? "s" : ""} inscrit{eleves.length > 1 ? "s" : ""}.</p>
      <Signature lignes={["Le Chef d'établissement"]} />
      <Pied note="Document établi à partir de la liste des apprenants scolarisés affichée à l'écran ; il reflète l'état du registre au moment de l'édition." />
    </Cadre>
  );
}

/* ------------------------------------------------------------------ Feuille d'appel (à cocher) */

function FeuilleAppel({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  const groupes = parClasse(eleves);
  return (
    <Cadre>
      <Tete titre="Feuille d'appel" meta={meta} sousTitre="Cocher la case de tout élève absent. Conserver la feuille signée." />
      <p className="mt-3 text-[12px] text-slate-600">Date de l'appel : ____ / ____ / ________</p>
      {groupes.map(([classe, ls]) => (
        <section key={classe} className="mt-5 break-inside-avoid">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-700">{classe} <span className="font-normal normal-case text-slate-400">· effectif {ls.length}</span></h2>
          <ul className="mt-1.5 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            {ls.map((e, i) => (
              <li key={e.id} className="flex items-center gap-2.5 border-b border-slate-100 py-1.5 text-[12.5px]">
                <span className="w-6 shrink-0 tabular-nums text-slate-400">{i + 1}</span>
                <span className="h-4 w-4 shrink-0 rounded-sm border border-slate-400" aria-hidden />
                <span className="min-w-0 truncate text-slate-800"><span className="uppercase">{e.nom}</span> {e.prenoms}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Signature lignes={["Le Professeur principal", "Le Chef d'établissement"]} />
      <Pied note="Feuille vierge destinée à l'appel papier ou à l'archivage. La saisie officielle de l'appel se fait dans l'espace enseignant ; ce document ne s'y substitue pas." />
    </Cadre>
  );
}

/* ------------------------------------------------------------------ PV de conseil (décisions à porter) */

function PvConseil({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  const groupes = parClasse(eleves);
  return (
    <Cadre>
      <Tete titre="Procès-verbal du conseil de classe" meta={meta} sousTitre="Reporter pour chaque apprenant la décision du conseil, puis faire signer." />
      <p className="mt-3 text-[12px] text-slate-600">Conseil tenu le ____ / ____ / ________ &nbsp;·&nbsp; Année scolaire : ____________</p>
      {groupes.map(([classe, ls]) => (
        <section key={classe} className="mt-5 break-inside-avoid">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-700">{classe} <span className="font-normal normal-case text-slate-400">· {ls.length} apprenant{ls.length > 1 ? "s" : ""}</span></h2>
          <table className="mt-1.5 w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-300 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-2 font-semibold">N°</th>
                <th className="py-1.5 pr-2 font-semibold">Apprenant</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Moyenne</th>
                <th className="py-1.5 pr-2 text-right font-semibold">Absences</th>
                <th className="py-1.5 pr-2 font-semibold">Décision (admis / maintien)</th>
                <th className="py-1.5 font-semibold">Observation</th>
              </tr>
            </thead>
            <tbody>
              {ls.map((e, i) => (
                <tr key={e.id} className="border-b border-slate-200">
                  <td className="h-8 py-1.5 pr-2 align-top tabular-nums text-slate-400">{i + 1}</td>
                  <td className="py-1.5 pr-2 align-top text-slate-800"><span className="uppercase">{e.nom}</span> {e.prenoms}</td>
                  <td className="py-1.5 pr-2 align-top text-right tabular-nums text-slate-700">{e.moyenne != null ? nombre(e.moyenne, 2) : "—"}</td>
                  <td className="py-1.5 pr-2 align-top text-right tabular-nums text-slate-700">{e.absences}</td>
                  <td className="py-1.5 pr-2 align-top" />
                  <td className="py-1.5 align-top" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <Signature lignes={["Le Professeur principal", "Le Chef d'établissement"]} />
      <Pied note="Le présent procès-verbal reprend la liste affichée à l'écran. La décision officielle de passage est enregistrée dans l'application ; ce document en conserve la trace signée." />
    </Cadre>
  );
}

/* ------------------------------------------------------------------ Bloc de signature */

function Signature({ lignes }: { lignes: string[] }) {
  return (
    <div className="mt-8 grid grid-cols-2 gap-6">
      {lignes.map((l) => (
        <div key={l} className="text-center">
          <p className="mb-10 text-[12px] font-semibold uppercase tracking-wide text-slate-500">{l}</p>
          <p className="border-t border-slate-400 pt-1 text-[11px] text-slate-400">Date et signature</p>
        </div>
      ))}
    </div>
  );
}
