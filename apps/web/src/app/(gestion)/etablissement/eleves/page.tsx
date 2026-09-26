"use client";

import { Activity, ArrowDownAZ, ArrowRight, ChevronDown, Download, Fingerprint, Printer, ShieldAlert, TrendingDown, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { EntreePage, motion } from "@/components/motion";
import { FeuilleImprimable } from "@/components/etats/Etats";
import { Badge, Button, Card, EtatVide, PageHeader, Segmente, Squelette, type Ton } from "@/components/ui/primitives";
import { useEleves, useTableau, type EleveLigne } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { exporterCsv, type Colonne } from "@/lib/export";
import { date, entier, nombre, note } from "@/lib/format";
import { evaluerRisque, LIBELLE_NIVEAU, type EvaluationRisque, type FacteurRisque, type NiveauRisque, type Sensibilite } from "@/lib/risque";
import { useEtablissementCourant } from "@/lib/session";
import { Avatar, ChampRecherche, classeSelect, EtatErreur, HorsPerimetre, LienBouton, normaliser, Statut } from "../_composants";

type Filtre = "tous" | "baisse" | "identite" | "risque";
type Tri = "classe" | "nom" | "moyenne_desc" | "moyenne_asc" | "absences" | "risque_desc";
const FILTRES: Filtre[] = ["tous", "baisse", "identite", "risque"];
const TRIS: { valeur: Tri; libelle: string }[] = [
  { valeur: "classe", libelle: "Classe, puis nom" },
  { valeur: "nom", libelle: "Nom (A → Z)" },
  { valeur: "moyenne_desc", libelle: "Moyenne décroissante" },
  { valeur: "moyenne_asc", libelle: "Moyenne croissante" },
  { valeur: "absences", libelle: "Absences (les plus nombreuses)" },
  { valeur: "risque_desc", libelle: "Risque de décrochage (le plus élevé)" },
];
const TON_NIVEAU: Record<NiveauRisque, Ton> = { nominal: "neutre", a_surveiller: "avertissement", urgent: "critique" };
const SENSIBILITES: { valeur: Sensibilite; libelle: string }[] = [
  { valeur: "basse", libelle: "Seuils bas" },
  { valeur: "normale", libelle: "Normaux" },
  { valeur: "elevee", libelle: "Sensibles" },
];
const PAS = 60;
const fr = new Intl.Collator("fr");

const LIBELLE_IDENTITE: Record<EleveLigne["statutIdentite"], string> = {
  verifiee: "Vérifiée",
  regularisation_en_cours: "Régularisation en cours",
};

/** Colonnes exportées : le même contenu que l'écran, mis en forme pour Excel (locale fr). */
const COLONNES: Colonne<EleveLigne>[] = [
  { entete: "Identifiant", valeur: (e) => e.id },
  { entete: "Nom", valeur: (e) => e.nom },
  { entete: "Prénoms", valeur: (e) => e.prenoms },
  { entete: "Sexe", valeur: (e) => e.sexe },
  { entete: "Date de naissance", valeur: (e) => date(e.dateNaissance) },
  { entete: "Classe", valeur: (e) => e.classe },
  { entete: "Moyenne", valeur: (e) => note(e.moyenne) },
  { entete: "Absences", valeur: (e) => e.absences },
  { entete: "Identité", valeur: (e) => LIBELLE_IDENTITE[e.statutIdentite] },
  { entete: "Baisse en mathématiques", valeur: (e) => (e.baisseMaths ? e.baisseMaths.map((n) => nombre(n, 1)).join(" → ") : "") },
];

export default function Page() {
  return (
    <EntreePage>
      <Suspense fallback={<div className="space-y-5"><Squelette className="h-16 w-80" /><Squelette className="h-14" /><Squelette className="h-96" /></div>}>
        <Liste />
      </Suspense>
    </EntreePage>
  );
}

function Liste() {
  const id = useEtablissementCourant();
  const eleves = useEleves(id);
  const tableau = useTableau(id);
  const params = useSearchParams();
  const router = useRouter();
  const chemin = usePathname();
  const brut = params.get("filtre");
  const filtre: Filtre = FILTRES.includes(brut as Filtre) ? (brut as Filtre) : "tous";
  const [classe, setClasse] = useState("toutes");
  const [q, setQ] = useState("");
  const [tri, setTri] = useState<Tri>("classe");
  const [limite, setLimite] = useState(PAS);
  const [sens, setSens] = useState<Sensibilite>("normale");
  const [vigilanceOuverte, setVigilanceOuverte] = useState(true);
  const [impression, setImpression] = useState(false);

  const choisirFiltre = (f: Filtre) => {
    const p = new URLSearchParams(params.toString());
    if (f === "tous") p.delete("filtre"); else p.set("filtre", f);
    router.replace(`${chemin}${p.size ? `?${p}` : ""}`, { scroll: false });
    setLimite(PAS);
  };

  const donnees = eleves.data;
  // Évaluation recalculée dès que la cohorte ou la sensibilité change ; indexée par identifiant.
  const evals = useMemo(() => {
    const m = new Map<string, EvaluationRisque>();
    for (const e of donnees ?? []) m.set(e.id, evaluerRisque(e, sens));
    return m;
  }, [donnees, sens]);
  const risque = (id: string) => evals.get(id)!;

  const compte = useMemo(() => ({
    baisse: donnees?.filter((e) => e.baisseMaths).length ?? 0,
    identite: donnees?.filter((e) => e.statutIdentite === "regularisation_en_cours").length ?? 0,
    risque: donnees?.filter((e) => evals.get(e.id)!.niveau !== "nominal").length ?? 0,
  }), [donnees, evals]);
  const classes = useMemo(() => [...new Set((donnees ?? []).map((e) => e.classe))].sort(fr.compare), [donnees]);

  const liste = useMemo(() => {
    const n = normaliser(q);
    const l = (donnees ?? [])
      .filter((e) => filtre === "tous" || (filtre === "baisse" ? !!e.baisseMaths : filtre === "identite" ? e.statutIdentite === "regularisation_en_cours" : evals.get(e.id)!.niveau !== "nominal"))
      .filter((e) => classe === "toutes" || e.classe === classe)
      .filter((e) => !n || normaliser(`${e.nom} ${e.prenoms} ${e.prenoms} ${e.nom} ${e.id}`).includes(n));
    const moy = (e: EleveLigne) => e.moyenne ?? -1;
    return [...l].sort((a, b) => {
      switch (tri) {
        case "nom": return fr.compare(a.nom, b.nom) || fr.compare(a.prenoms, b.prenoms);
        case "moyenne_desc": return moy(b) - moy(a);
        case "moyenne_asc": return (a.moyenne ?? 99) - (b.moyenne ?? 99);
        case "absences": return b.absences - a.absences || fr.compare(a.nom, b.nom);
        case "risque_desc": return evals.get(b.id)!.score - evals.get(a.id)!.score || fr.compare(a.nom, b.nom);
        default: return fr.compare(a.classe, b.classe) || fr.compare(a.nom, b.nom) || fr.compare(a.prenoms, b.prenoms);
      }
    });
  }, [donnees, filtre, classe, q, tri, evals]);

  if (!id) return <HorsPerimetre />;
  const visibles = liste.slice(0, limite);

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Processus P7 · P9"
        titre="Apprenants"
        sousTitre={donnees ? `${entier(donnees.length)} apprenants scolarisés. Chaque dossier s'ouvre au titre de la gestion de l'établissement ; chaque ouverture est journalisée.` : "Apprenants scolarisés dans votre établissement."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variante="secondaire" icone={Download} disabled={!liste.length} onClick={() => exporterCsv(`apprenants_${id}`, liste, [...COLONNES, { entete: "Score de risque", valeur: (e: EleveLigne) => evals.get(e.id)!.score }, { entete: "Niveau de risque", valeur: (e: EleveLigne) => LIBELLE_NIVEAU[evals.get(e.id)!.niveau] }])} title={`Exporter les ${liste.length} lignes affichées au format CSV (avec le risque)`}>Exporter</Button>
            <Button variante="secondaire" icone={Printer} disabled={!liste.length} onClick={() => setImpression(true)} title="Imprimer un état nominatif, une feuille d'appel ou un PV de conseil">Imprimer</Button>
            <LienBouton href="/etablissement/inscription" icone={UserPlus}>Inscrire un apprenant</LienBouton>
          </div>
        }
      />

      <div data-guide="eleves-filtres" className="-mx-1 overflow-x-auto px-1 pb-1">
        <Segmente label="Filtre" valeur={filtre} onChange={choisirFiltre} options={[
          { valeur: "tous", libelle: donnees ? `Tous (${donnees.length})` : "Tous" },
          { valeur: "risque", libelle: `À risque (${compte.risque})` },
          { valeur: "baisse", libelle: `En baisse (${compte.baisse})` },
          { valeur: "identite", libelle: `Identité à régulariser (${compte.identite})` },
        ]} />
      </div>

      {donnees && donnees.length > 0 && (
        <PanneauVigilance
          eleves={donnees}
          risque={risque}
          sens={sens}
          setSens={setSens}
          ouvert={vigilanceOuverte}
          onBasculer={() => setVigilanceOuverte((v) => !v)}
        />
      )}

      <Card data-guide="eleves-recherche" className="p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <ChampRecherche valeur={q} onChange={(v) => { setQ(v); setLimite(PAS); }} placeholder="Nom, prénom ou identifiant" label="Rechercher un apprenant" />
          <select value={classe} onChange={(e) => { setClasse(e.target.value); setLimite(PAS); }} aria-label="Classe" className={classeSelect}>
            <option value="toutes">Toutes les classes</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="relative">
            <span className="sr-only">Trier</span>
            <ArrowDownAZ size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
            <select value={tri} onChange={(e) => setTri(e.target.value as Tri)} aria-label="Trier" className={cn(classeSelect, "w-full pl-9")}>
              {TRIS.map((t) => <option key={t.valeur} value={t.valeur}>{t.libelle}</option>)}
            </select>
          </label>
        </div>
      </Card>

      {eleves.isPending ? (
        <Card className="overflow-hidden p-0">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="flex items-center gap-3 border-t border-line/60 px-5 py-3 first:border-t-0"><Squelette className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-1.5"><Squelette className="h-4 w-48" /><Squelette className="h-3 w-24" /></div><Squelette className="hidden h-4 w-16 sm:block" /></div>)}
        </Card>
      ) : eleves.isError ? (
        <Card><EtatErreur erreur={eleves.error} reessayer={() => eleves.refetch()} /></Card>
      ) : liste.length === 0 ? (
        <Card>
          <EtatVide icone={Users} titre="Aucun apprenant" texte={donnees?.length ? "Aucun apprenant ne correspond à ces critères." : "Aucun apprenant n'est encore inscrit dans l'établissement."}
            action={donnees?.length ? <Button variante="secondaire" taille="sm" onClick={() => { setQ(""); setClasse("toutes"); choisirFiltre("tous"); }}>Effacer les filtres</Button> : <LienBouton href="/etablissement/inscription" taille="sm" icone={UserPlus}>Inscrire un apprenant</LienBouton>} />
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-ink-muted" aria-live="polite">{entier(liste.length)} apprenant{liste.length > 1 ? "s" : ""}{liste.length > visibles.length ? ` · ${visibles.length} affichés` : ""}</p>

          {/* Cartes sous md */}
          <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
            {visibles.map((e, i) => (
              <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }}>
                <Link href={`/etablissement/eleves/${e.id}`} className="flex h-full flex-col rounded-lg border border-line/70 bg-surface p-4 shadow-float transition-all duration-200 hover:-translate-y-1 hover:shadow-pop active:scale-[0.99]">
                  <div className="flex items-center gap-3">
                    <Avatar prenoms={e.prenoms} nom={e.nom} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{e.prenoms} {e.nom}</p>
                      <p className="text-xs text-ink-muted">{e.classe} · <span className="font-mono">{e.id}</span></p>
                    </div>
                    <ArrowRight size={16} className="shrink-0 text-ink-muted" aria-hidden />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
                    <div className="rounded-md bg-surface-2/60 px-2.5 py-1.5"><dt className="text-ink-muted">Moyenne T2</dt><dd className={cn("font-semibold tabular", e.moyenne != null && e.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(e.moyenne, 2)}</dd></div>
                    <div className="rounded-md bg-surface-2/60 px-2.5 py-1.5"><dt className="text-ink-muted">Absences</dt><dd className="font-semibold tabular text-ink">{e.absences}</dd></div>
                    <div className="rounded-md bg-surface-2/60 px-2.5 py-1.5"><dt className="text-ink-muted">Risque</dt><dd className="mt-0.5"><PuceRisque ev={risque(e.id)} compact /></dd></div>
                  </dl>
                  {(e.baisseMaths || e.statutIdentite === "regularisation_en_cours") && <Signalements e={e} className="mt-2.5" />}
                </Link>
              </motion.li>
            ))}
          </ul>

          {/* Tableau à partir de md */}
          <Card className="hidden overflow-hidden p-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="px-5 py-2.5 font-semibold">Apprenant</th>
                    <th className="px-5 py-2.5 font-semibold">Classe</th>
                    <th className="px-5 py-2.5 text-right font-semibold">Moyenne T2</th>
                    <th className="hidden px-5 py-2.5 text-right font-semibold lg:table-cell">Absences</th>
                    <th className="px-5 py-2.5 font-semibold">Risque</th>
                    <th className="px-5 py-2.5 font-semibold">Signalement</th>
                    <th className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((e, i) => (
                    <motion.tr key={e.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.035 }}
                      className="group cursor-pointer border-t border-line/60 hover:bg-surface-2/50" onClick={() => router.push(`/etablissement/eleves/${e.id}`)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar prenoms={e.prenoms} nom={e.nom} taille="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-ink"><span className="uppercase">{e.nom}</span> {e.prenoms}</p>
                            <p className="font-mono text-xs text-ink-muted">{e.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink-2">{e.classe}</td>
                      <td className={cn("px-5 py-3 text-right font-medium", e.moyenne != null && e.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(e.moyenne, 2)}</td>
                      <td className="hidden px-5 py-3 text-right text-ink-2 lg:table-cell">{e.absences}</td>
                      <td className="px-5 py-3"><PuceRisque ev={risque(e.id)} /></td>
                      <td className="px-5 py-3"><Signalements e={e} /></td>
                      <td className="px-5 py-3 text-right">
                        <LienBouton href={`/etablissement/eleves/${e.id}`} onClick={(ev) => ev.stopPropagation()} variante="fantome" taille="sm" className="group-hover:bg-surface group-hover:text-blue">Dossier <ArrowRight size={13} aria-hidden /></LienBouton>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {liste.length > visibles.length && (
            <div className="flex justify-center">
              <Button variante="secondaire" onClick={() => setLimite((l) => l + PAS)}>Afficher {Math.min(PAS, liste.length - visibles.length)} de plus</Button>
            </div>
          )}
        </>
      )}

      {impression && (
        <FeuilleImprimable
          eleves={liste}
          meta={{ etablissement: tableau.data?.etablissement.nom ?? "", classe: classe === "toutes" ? "Toutes les classes" : classe, trimestre: tableau.data?.trimestre ?? 2, dateJour: new Date().toISOString() }}
          onFermer={() => setImpression(false)}
        />
      )}
    </div>
  );
}

function Signalements({ e, className }: { e: EleveLigne; className?: string }) {
  if (!e.baisseMaths && e.statutIdentite !== "regularisation_en_cours") return <span className={cn("text-xs text-ink-muted", className)}>—</span>;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {e.baisseMaths && <Badge ton="avertissement" icone={TrendingDown}>Maths {e.baisseMaths.map((n) => nombre(n, 1)).join(" → ")}</Badge>}
      {e.statutIdentite === "regularisation_en_cours" && <Statut ton="info"><Fingerprint size={12} aria-hidden /> Régularisation</Statut>}
    </div>
  );
}

/* ------------------------------------------------------------------ Pastille de risque */

function PuceRisque({ ev, compact }: { ev: EvaluationRisque; compact?: boolean }) {
  if (ev.niveau === "nominal") return <span className="text-xs text-ink-muted">{compact ? "—" : "Nominal"}</span>;
  const raison = ev.facteurs.filter((f) => f.points > 0).map((f) => f.detail).join(" · ");
  return (
    <span title={`Score ${ev.score}/100 — ${raison}${ev.fiable ? "" : " · signal mince"}`}>
      <Badge ton={TON_NIVEAU[ev.niveau]} icone={ShieldAlert}>{compact ? `${LIBELLE_NIVEAU[ev.niveau]} ${ev.score}` : `${LIBELLE_NIVEAU[ev.niveau]} · ${ev.score}`}</Badge>
    </span>
  );
}

/* ------------------------------------------------------------------ Panneau de vigilance (décrochage) */

function PanneauVigilance({ eleves, risque, sens, setSens, ouvert, onBasculer }: {
  eleves: EleveLigne[];
  risque: (id: string) => EvaluationRisque;
  sens: Sensibilite;
  setSens: (s: Sensibilite) => void;
  ouvert: boolean;
  onBasculer: () => void;
}) {
  const evalues = eleves.map((e) => ({ e, ev: risque(e.id) }));
  const n = { urgent: 0, a_surveiller: 0, nominal: 0 };
  for (const { ev } of evalues) n[ev.niveau]++;
  const aSuivre = evalues.filter((x) => x.ev.niveau !== "nominal").sort((a, b) => b.ev.score - a.ev.score);

  return (
    <Card data-guide="eleves-vigilance" className="min-w-0 overflow-hidden p-0">
      <button onClick={onBasculer} aria-expanded={ouvert} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-critical-bg text-critical"><Activity size={16} aria-hidden /></span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">Vigilance décrochage</span>
            <span className="block text-xs text-ink-muted">
              {aSuivre.length === 0 ? "Aucun apprenant au-dessus du seuil" : `${n.urgent} urgent(s) · ${n.a_surveiller} à surveiller · score explicable, calculé ici`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-ink-muted transition-transform duration-200", ouvert && "rotate-180")} aria-hidden />
      </button>

      <div className={cn("border-t border-line/60", ouvert ? "block" : "hidden")}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <p className="max-w-xl text-[13px] text-ink-2">
            Le score additionne trois signaux déjà connus de l'établissement — moyenne, absences, tendance en maths. Aucun algorithme opaque : chaque contribution est affichée. Le statut d'identité, administratif, n'entre pas dans le calcul.
          </p>
          <div className="-mx-1 overflow-x-auto px-1">
            <Segmente label="Sensibilité des seuils" valeur={sens} onChange={setSens} options={SENSIBILITES} />
          </div>
        </div>

        {aSuivre.length === 0 ? (
          <EtatVide icone={ShieldAlert} titre="Personne à signaler" texte="Aucun apprenant ne franchit le seuil de vigilance avec ces réglages." />
        ) : (
          <ul className="divide-y divide-line/60 border-t border-line/60">
            {aSuivre.slice(0, 8).map(({ e, ev }) => (
              <li key={e.id} className="grid gap-x-4 gap-y-2.5 px-5 py-3.5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar prenoms={e.prenoms} nom={e.nom} taille="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink"><span className="uppercase">{e.nom}</span> {e.prenoms}</p>
                    <p className="text-xs text-ink-muted">{e.classe} · score {ev.score}/100</p>
                  </div>
                  <Badge ton={TON_NIVEAU[ev.niveau]}>{LIBELLE_NIVEAU[ev.niveau]}</Badge>
                </div>
                <div className="space-y-1.5">
                  {ev.facteurs.filter((f) => f.points > 0).map((f) => (
                    <BarreFacteur key={f.cle} facteur={f} />
                  ))}
                </div>
                <div className="justify-self-start lg:justify-self-end">
                  <LienBouton href={`/etablissement/eleves/${e.id}`} variante="secondaire" taille="sm">Dossier</LienBouton>
                </div>
              </li>
            ))}
            {aSuivre.length > 8 && (
              <li className="px-5 py-2.5 text-center text-xs text-ink-muted">
                et {entier(aSuivre.length - 8)} apprenant{aSuivre.length - 8 > 1 ? "s" : ""} de plus — basculez le filtre « À risque » pour les lister.
              </li>
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}

function BarreFacteur({ facteur }: { facteur: FacteurRisque }) {
  const ratio = Math.min(100, (facteur.points / facteur.pointsMax) * 100);
  const ton = ratio >= 66 ? "bg-critical" : ratio >= 33 ? "bg-warning" : "bg-[var(--series-1)]";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 text-[12px] sm:grid-cols-[7.5rem_minmax(0,1fr)_3rem]">
      <span className="truncate text-ink-2">{facteur.libelle}</span>
      <span className="flex items-center gap-2">
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"><span className={cn("block h-full rounded-full transition-[width] duration-500", ton)} style={{ width: `${Math.max(4, ratio)}%` }} /></span>
        <span className="tabular text-ink-muted">+{facteur.points}</span>
      </span>
      <span className="truncate text-ink-muted sm:text-right">{facteur.detail}</span>
    </div>
  );
}
