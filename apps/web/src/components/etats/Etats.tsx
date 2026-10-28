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

export type GenreEtat = "nominatif" | "effectifs" | "appel" | "emargement" | "honneur" | "pv";

const GENRES: { valeur: GenreEtat; libelle: string }[] = [
  { valeur: "nominatif", libelle: "État nominatif" },
  { valeur: "effectifs", libelle: "Effectifs filles / garçons" },
  { valeur: "appel", libelle: "Feuille d'appel" },
  { valeur: "emargement", libelle: "Feuille d'émargement" },
  { valeur: "honneur", libelle: "Tableau d'honneur" },
  { valeur: "pv", libelle: "PV de conseil" },
];

/** `criteres` : les filtres de l'écran (niveau, classe, sexe), repris en tête de chaque état. */
export interface MetaEtat { etablissement: string; classe: string; criteres?: string; trimestre: number; dateJour: string }

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
        {genre === "effectifs" && <Effectifs eleves={eleves} meta={meta} />}
        {genre === "appel" && <FeuilleAppel eleves={eleves} meta={meta} />}
        {genre === "emargement" && <Emargement eleves={eleves} meta={meta} />}
        {genre === "honneur" && <TableauHonneur eleves={eleves} meta={meta} />}
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
      <p className="mt-0.5 text-[12px] text-slate-500">{meta.criteres ? `Sélection : ${meta.criteres}` : `Classe : ${meta.classe}`} · T{meta.trimestre} · édité le {date(meta.dateJour)}</p>
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

/* ------------------------------------------------------------------ Effectifs filles / garçons (par classe) */

const pourcent = (n: number, total: number) => (total ? `${nombre((n / total) * 100, 0)} %` : "—");

function Effectifs({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  const groupes = parClasse(eleves);
  const f = eleves.filter((e) => e.sexe === "F").length;
  return (
    <Cadre>
      <Tete titre="Effectifs par classe, filles et garçons" meta={meta} sousTitre="Apprenants scolarisés à la date d'édition (sans nom : document diffusable en interne)." />
      <table className="mt-4 w-full border-collapse text-[12.5px] tabular-nums">
        <thead>
          <tr className="border-b border-slate-300 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
            <th className="py-1.5 pr-2 font-semibold">Classe</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Filles</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Garçons</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Total</th>
            <th className="py-1.5 text-right font-semibold">Part des filles</th>
          </tr>
        </thead>
        <tbody>
          {groupes.map(([classe, ls]) => {
            const nf = ls.filter((e) => e.sexe === "F").length;
            return (
              <tr key={classe} className="border-b border-slate-100">
                <td className="py-1.5 pr-2 text-slate-800">{classe}</td>
                <td className="py-1.5 pr-2 text-right text-slate-700">{nf}</td>
                <td className="py-1.5 pr-2 text-right text-slate-700">{ls.length - nf}</td>
                <td className="py-1.5 pr-2 text-right font-semibold text-slate-900">{ls.length}</td>
                <td className="py-1.5 text-right text-slate-700">{pourcent(nf, ls.length)}</td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-slate-900 font-semibold">
            <td className="py-1.5 pr-2">Ensemble</td>
            <td className="py-1.5 pr-2 text-right">{f}</td>
            <td className="py-1.5 pr-2 text-right">{eleves.length - f}</td>
            <td className="py-1.5 pr-2 text-right">{eleves.length}</td>
            <td className="py-1.5 text-right">{pourcent(f, eleves.length)}</td>
          </tr>
        </tbody>
      </table>
      <Signature lignes={["Le Chef d'établissement"]} />
      <Pied note="Comptage des apprenants scolarisés affichés à l'écran (filtres compris). Sexe tel qu'enregistré au registre." />
    </Cadre>
  );
}

/* ------------------------------------------------------------------ Feuille d'émargement (signature de présence) */

function Emargement({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  const groupes = parClasse(eleves);
  return (
    <Cadre>
      <Tete titre="Feuille d'émargement" meta={meta} sousTitre="Chaque apprenant signe en face de son nom (composition, remise de documents, réunion)." />
      <p className="mt-3 text-[12px] text-slate-600">Objet : ________________________________ &nbsp;·&nbsp; Date : ____ / ____ / ________</p>
      {groupes.map(([classe, ls]) => (
        <section key={classe} className="mt-5 break-inside-avoid">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-700">{classe} <span className="font-normal normal-case text-slate-400">· effectif {ls.length}</span></h2>
          <table className="mt-1.5 w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-300 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="w-8 py-1.5 pr-2 font-semibold">N°</th>
                <th className="py-1.5 pr-2 font-semibold">Apprenant</th>
                <th className="w-[45%] py-1.5 font-semibold">Signature</th>
              </tr>
            </thead>
            <tbody>
              {ls.map((e, i) => (
                <tr key={e.id} className="border-b border-slate-200">
                  <td className="h-9 py-1.5 pr-2 align-middle tabular-nums text-slate-400">{i + 1}</td>
                  <td className="py-1.5 pr-2 align-middle text-slate-800"><span className="uppercase">{e.nom}</span> {e.prenoms}</td>
                  <td className="py-1.5 align-middle" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <Signature lignes={["Le Surveillant", "Le Chef d'établissement"]} />
      <Pied note="Document de travail imprimé depuis la liste affichée à l'écran." />
    </Cadre>
  );
}

/* ------------------------------------------------------------------ Tableau d'honneur (par classe) */

/**
 * Les meilleures moyennes de chaque classe, au trimestre affiché. Classement ex æquo (même moyenne, même rang) ;
 * un apprenant sans moyenne n'est pas classé. La moyenne est NON PONDÉRÉE (aucun coefficient transmis à la
 * plateforme) : le document le dit, et il ne compare jamais deux classes ni deux écoles.
 */
export function classerParClasse(eleves: EleveLigne[], n: number): [string, { e: EleveLigne; rang: number }[]][] {
  return parClasse(eleves).map(([classe, ls]) => {
    const notes = ls.filter((e) => e.moyenne != null).sort((a, b) => b.moyenne! - a.moyenne! || a.nom.localeCompare(b.nom, "fr"));
    // Rang « olympique » : même moyenne, même rang ; le suivant saute les ex æquo (1, 1, 3).
    const rangs = notes.map((e) => ({ e, rang: notes.findIndex((x) => x.moyenne === e.moyenne) + 1 }));
    // On garde les n premiers rangs, ex æquo du dernier rang compris.
    const seuil = rangs[n - 1]?.rang ?? Infinity;
    return [classe, rangs.filter((x) => x.rang <= seuil)];
  });
}

function TableauHonneur({ eleves, meta }: { eleves: EleveLigne[]; meta: MetaEtat }) {
  const [n, setN] = useState(5);
  const groupes = classerParClasse(eleves, n);
  return (
    <Cadre>
      <div className="mb-3 flex items-center gap-2 print:hidden">
        <label className="text-[12.5px] text-slate-600" htmlFor="rangs-honneur">Nombre de rangs par classe</label>
        <select id="rangs-honneur" value={n} onChange={(e) => setN(Number(e.target.value))} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-[12.5px]">
          {[3, 5, 10].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
      <Tete titre="Tableau d'honneur" meta={meta} sousTitre={`Les ${n} meilleures moyennes de chaque classe au trimestre ${meta.trimestre} (ex æquo compris).`} />
      {groupes.map(([classe, ls]) => (
        <section key={classe} className="mt-5 break-inside-avoid">
          <h2 className="text-[13px] font-bold uppercase tracking-wide text-slate-700">{classe}</h2>
          {ls.length === 0 ? <p className="mt-1 text-[12.5px] text-slate-500">Aucune moyenne disponible ce trimestre.</p> : (
            <table className="mt-1.5 w-full border-collapse text-[12.5px] tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="w-12 py-1.5 pr-2 font-semibold">Rang</th>
                  <th className="py-1.5 pr-2 font-semibold">Apprenant</th>
                  <th className="py-1.5 text-right font-semibold">Moyenne</th>
                </tr>
              </thead>
              <tbody>
                {ls.map(({ e, rang }, i) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 text-slate-700">{rang}{i > 0 && ls[i - 1]!.rang === rang ? " ex æquo" : rang === 1 ? "er" : "e"}</td>
                    <td className="py-1.5 pr-2 text-slate-800"><span className="uppercase">{e.nom}</span> {e.prenoms}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">{nombre(e.moyenne!, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}
      <Signature lignes={["Le Chef d'établissement"]} />
      <Pied note="Classement indicatif : moyennes NON PONDÉRÉES (la plateforme ne reçoit pas les coefficients), calculées sur les notes saisies au trimestre. Il classe les apprenants d'une même classe, jamais des classes ou des écoles entre elles. Document nominatif concernant des mineurs : affichage selon la politique de l'établissement." />
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
