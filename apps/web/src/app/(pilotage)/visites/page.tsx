"use client";

import type { Perimetre } from "@beile/contracts";
import { CalendarClock, CalendarPlus, ChevronDown, History, MapPin, School, Search, Stamp } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, Cascade, Compteur, EASE, Element, motion } from "@/components/motion";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { cn } from "@/lib/cn";
import { date, entier, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { LIBELLE_STATUT_ETABLISSEMENT } from "@/lib/api/scolarite-superieure";
import {
  useConsignerVisite, useCouvertureVisites, useVisites,
  type CouvertureVisites, type CycleEtablissement, type EtablissementCouvert, type FiltreCycle, type Visite,
} from "@/lib/api/visites";
import { EtatEchec, Feuille, libellePerimetre, nomDepartement, pluriel } from "../_commun";

/**
 * Visites d'inspection (processus P9) : la couverture du territoire par la tutelle, école par école, puis le
 * compte rendu de ce que l'agent a vu. Tout vient de `ledger.evenements` — une visite est un fait sur un
 * établissement, jamais sur une personne ; rien n'est recopié dans une table nouvelle.
 */

const CYCLES: { valeur: FiltreCycle; libelle: string }[] = [
  { valeur: "tous", libelle: "Tous cycles" },
  { valeur: "primaire", libelle: "Primaire" },
  { valeur: "secondaire", libelle: "Secondaire" },
  { valeur: "superieur", libelle: "Supérieur" },
];
const LIBELLE_CYCLE: Record<CycleEtablissement, string> = { primaire: "Primaire", secondaire: "Secondaire", superieur: "Supérieur" };

/** Date du jour en UTC : la borne « pas de date future » est appréciée en UTC côté serveur. */
const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);

const input = "mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[14px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15";

export default function VisitesInspecteur() {
  const [cycle, setCycle] = useState<FiltreCycle>("tous");
  const [focus, setFocus] = useState<string | null>(null);
  const [depuis, setDepuis] = useState<string | null>(null);
  const [miennes, setMiennes] = useState(false);
  const [consigner, setConsigner] = useState(false);

  const couverture = useCouvertureVisites(cycle);
  const filtres = useMemo(() => ({ etablissementId: focus, depuis, miennes }), [focus, depuis, miennes]);
  const visites = useVisites(filtres);

  if (couverture.isPending) return <Chargement />;
  if (couverture.isError && !couverture.data) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Visites d'inspection" titre="La tutelle sur le terrain" />
        <EtatEchec erreur={couverture.error} onReessayer={() => couverture.refetch()} titreRefus="Les visites s'écrivent et se lisent entre agents de tutelle" />
      </div>
    );
  }

  const d = couverture.data;
  const jamaisVisités = d.attendus - d.couverts;
  const selection = focus ? d.etablissements.find((e) => e.id === focus) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Visites d'inspection · ${libellePerimetre(d.perimetre)}`}
        titre="La tutelle sur le terrain"
        sousTitre="Couverture du périmètre par les visites d'inspection, puis le compte rendu de chaque agent. Une visite consignée ne se modifie pas : une correction est une nouvelle visite qui cite la précédente."
        actions={<Button icone={CalendarPlus} onClick={() => setConsigner(true)}>Consigner une visite</Button>}
      />

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element>
          <TuileIndicateur
            libelle="Établissements du périmètre" icone={School} valeur={<Compteur valeur={d.attendus} format={entier} />}
            indice={<span>{cycle === "tous" ? "tous cycles" : LIBELLE_CYCLE[cycle]}</span>}
          />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Déjà visités" icone={Stamp} accent="sarcelle" valeur={<Compteur valeur={d.couverts} format={entier} />}
            indice={<span>{pourcent(d.attendus ? (d.couverts / d.attendus) * 100 : null, 0)} du périmètre</span>}
          />
        </Element>
        <Element>
          <TuileIndicateur libelle="Visites consignées" icone={History} accent="bleu" valeur={<Compteur valeur={d.visites} format={entier} />} indice={<span>depuis l'ouverture du registre</span>} />
        </Element>
        <Element>
          <TuileIndicateur
            libelle="Jamais visités" icone={MapPin} accent={jamaisVisités > 0 ? "critique" : "neutre"} valeur={<Compteur valeur={jamaisVisités} format={entier} />}
            indice={<span>{jamaisVisités > 0 ? "à programmer" : "aucun établissement oublié"}</span>}
          />
        </Element>
      </Cascade>

      <div className="max-w-full overflow-x-auto">
        <div className="w-max"><Segmente label="Cycle des établissements" options={CYCLES} valeur={cycle} onChange={(v) => { setCycle(v); setFocus(null); }} /></div>
      </div>

      {d.parDepartement.length > 1 && <CouvertureParDepartement d={d} />}

      <div className="grid gap-6 lg:grid-cols-5">
        <CarteCouverture d={d} selection={focus} onSelect={setFocus} className="lg:col-span-3" />
        <CarteVisites
          data={visites.data} enCours={visites.isPending} erreur={visites.error} onReessayer={() => visites.refetch()}
          miennes={miennes} setMiennes={setMiennes} depuis={depuis} setDepuis={setDepuis}
          selection={selection} onLibererSelection={() => setFocus(null)} onConsigner={() => setConsigner(true)}
          className="lg:col-span-2"
        />
      </div>

      <FeuilleVisite ouvert={consigner} onFermer={() => setConsigner(false)} etablissements={d.etablissements} initiale={focus} />
    </div>
  );
}

function Chargement() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2"><Squelette className="h-3 w-64" /><Squelette className="h-8 w-72 max-w-full" /><Squelette className="h-4 w-[34rem] max-w-full" /></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Squelette className="h-[420px] rounded-xl lg:col-span-3" />
        <Squelette className="h-[420px] rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Couverture par département */

function CouvertureParDepartement({ d }: { d: CouvertureVisites }) {
  return (
    <Card>
      <CardHeader icon={MapPin} title="Répartition par département" subtitle="Le territoire qui compte le plus d'établissements sans visite est proposé d'abord." />
      <ul className="space-y-3">
        {d.parDepartement.map((x, i) => {
          const taux = x.attendus ? (x.couverts / x.attendus) * 100 : 0;
          return (
            <li key={x.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] font-medium text-ink">{nomDepartement(x.id === "hors carte" ? null : x.id)}</span>
                <span className="shrink-0 text-[12.5px] tabular text-ink-2">{entier(x.couverts)} / {entier(x.attendus)} <span className="text-ink-muted">· {pourcent(taux, 0)}</span></span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <motion.div className="h-full rounded-full bg-teal" initial={{ width: 0 }} animate={{ width: `${Math.max(taux, x.couverts ? 1.5 : 0)}%` }} transition={{ duration: 0.7, ease: EASE, delay: i * 0.04 }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ Établissements du périmètre */

function CarteCouverture({ d, selection, onSelect, className }: { d: CouvertureVisites; selection: string | null; onSelect: (id: string) => void; className?: string }) {
  const [q, setQ] = useState("");
  const [sansVisite, setSansVisite] = useState(false);

  const lignes = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return d.etablissements
      .filter((e) => (!sansVisite || e.visites === 0) && (!texte || e.nom.toLowerCase().includes(texte) || (e.commune ?? "").toLowerCase().includes(texte)))
      .slice(0, 60);
  }, [d.etablissements, q, sansVisite]);

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader
        icon={School}
        title="Établissements, les moins visités d'abord"
        subtitle="Jamais visités en tête, puis la visite la plus ancienne. Un clic ouvre le compte rendu."
        action={
          <button
            type="button" aria-pressed={sansVisite} onClick={() => setSansVisite((v) => !v)}
            className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors", sansVisite ? "bg-critical-bg text-critical ring-critical/30" : "bg-surface text-ink-2 ring-line hover:bg-surface-2")}
          >
            Sans visite seulement
          </button>
        }
      />
      <label className="relative block">
        <span className="sr-only">Rechercher un établissement</span>
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-ink-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un établissement ou une commune" className={cn(input, "pl-9")} />
      </label>
      {lignes.length ? (
        <ul className="mt-3 max-h-[26rem] divide-y divide-line/60 overflow-y-auto">
          {lignes.map((e) => <LigneEtablissement key={e.id} e={e} active={selection === e.id} onClick={() => onSelect(e.id)} />)}
        </ul>
      ) : (
        <EtatVide icone={Search} titre="Aucun établissement ne correspond" texte="Modifiez la recherche ou le filtre « sans visite »." />
      )}
      {d.tronque && (
        <p className="mt-3 rounded-md bg-warning-bg px-3 py-2 text-[12px] text-warning">
          Liste tronquée : {pluriel(d.attendus, "établissement")} dans le périmètre, {entier(d.etablissements.length)} ramenés. Affinez par cycle ou par recherche.
        </p>
      )}
    </Card>
  );
}

function LigneEtablissement({ e, active, onClick }: { e: EtablissementCouvert; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className={cn("flex min-h-14 w-full items-center gap-3 rounded-md px-1.5 py-2.5 text-left hover:bg-surface-2", active && "bg-blue-soft/60")}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{e.nom}</span>
          <span className="block truncate text-[12px] text-ink-muted">{e.commune ?? "commune inconnue"} · {LIBELLE_CYCLE[e.cycle] ?? e.cycle} · {LIBELLE_STATUT_ETABLISSEMENT[e.statut] ?? e.statut}</span>
        </span>
        <span className="shrink-0 text-right">
          {e.visites === 0 ? <Badge ton="critique">Jamais visité</Badge> : <Badge ton={e.visites < 2 ? "avertissement" : "succes"}>{pluriel(e.visites, "visite")}</Badge>}
          <span className="mt-1 block text-[11.5px] tabular text-ink-muted">{e.derniereLe ? `dernière le ${date(e.derniereLe)}` : "—"}</span>
        </span>
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ Comptes rendus */

function CarteVisites({ data, enCours, erreur, onReessayer, miennes, setMiennes, depuis, setDepuis, selection, onLibererSelection, onConsigner, className }: {
  data: { perimetre: Perimetre; lignes: Visite[] } | undefined;
  enCours: boolean; erreur: unknown; onReessayer: () => void;
  miennes: boolean; setMiennes: (v: boolean) => void;
  depuis: string | null; setDepuis: (v: string | null) => void;
  selection: EtablissementCouvert | undefined; onLibererSelection: () => void; onConsigner: () => void;
  className?: string;
}) {
  const [ouverte, setOuverte] = useState<string | null>(null);

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader
        icon={CalendarClock}
        title={selection ? `Visites · ${selection.nom}` : "Visites consignées"}
        subtitle={selection ? `${selection.commune ?? "—"} · ${pluriel(selection.visites, "visite")}` : "Dans le périmètre, les plus récentes d'abord."}
        action={selection ? <Button variante="fantome" taille="sm" onClick={onLibererSelection}>Toute la liste</Button> : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button" aria-pressed={miennes} onClick={() => setMiennes(!miennes)}
          className={cn("rounded-md px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-colors", miennes ? "bg-blue-soft text-accent-ink ring-blue/30" : "bg-surface text-ink-2 ring-line hover:bg-surface-2")}
        >
          Mes visites
        </button>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
          depuis le
          <input
            type="date" value={depuis ?? ""} max={aujourdhuiIso()} onChange={(e) => setDepuis(e.target.value || null)}
            className="h-9 rounded-lg border border-line bg-bg px-2.5 text-[13px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15"
          />
        </label>
      </div>

      <div className="mt-3 flex-1">
        {enCours && !data ? (
          <div className="space-y-2" aria-busy="true">{Array.from({ length: 5 }, (_, i) => <Squelette key={i} className="h-12" />)}</div>
        ) : erreur && !data ? (
          <EtatEchec erreur={erreur} onReessayer={onReessayer} className="border-0 p-0 shadow-none" titreRefus="Compte rendu réservé aux agents de tutelle" />
        ) : data?.lignes.length ? (
          <ul className="space-y-2">
            {data.lignes.map((v) => (
              <LigneVisite key={v.id} v={v} ouverte={ouverte === v.id} onBasculer={() => setOuverte(ouverte === v.id ? null : v.id)} />
            ))}
          </ul>
        ) : (
          <EtatVide
            icone={CalendarClock}
            titre="Aucune visite pour ce filtre"
            texte="Rien n'est encore consigné ici. Le compte rendu d'une visite apparaît dès qu'un agent de tutelle l'enregistre."
            action={<Button variante="secondaire" taille="sm" icone={CalendarPlus} onClick={onConsigner}>Consigner une visite</Button>}
          />
        )}
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-muted">Constats et recommandations sont une pièce administrative : ils ne sortent qu'entre agents de tutelle, et chaque lecture est journalisée.</p>
    </Card>
  );
}

function LigneVisite({ v, ouverte, onBasculer }: { v: Visite; ouverte: boolean; onBasculer: () => void }) {
  return (
    <li className="overflow-hidden rounded-lg border border-line/70 bg-surface-2/40">
      <button type="button" aria-expanded={ouverte} onClick={onBasculer} className="flex w-full items-start gap-3 px-3 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{v.objet}</span>
          <span className="mt-0.5 block truncate text-[12px] text-ink-muted">{v.etablissement} · visité le {v.dateVisite ? date(v.dateVisite) : "—"} · {v.agent}</span>
        </span>
        <ChevronDown size={15} aria-hidden className={cn("mt-1 shrink-0 text-ink-muted transition-transform duration-200", ouverte && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {ouverte && (
          <motion.div key="corps" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }} className="overflow-hidden">
            <div className="border-t border-line/60 px-3 py-3 text-[13px]">
              <Etiquette>Constats</Etiquette>
              <p className="mt-1 whitespace-pre-line leading-snug text-ink">{v.constats}</p>
              {v.recommandations && (
                <>
                  <Etiquette className="mt-3 block">Recommandations</Etiquette>
                  <p className="mt-1 whitespace-pre-line leading-snug text-ink">{v.recommandations}</p>
                </>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
                <div className="min-w-0"><dt className="text-ink-muted">Référence du rapport</dt><dd className="mt-0.5 truncate font-mono text-[12px] text-ink">{v.referenceRapport ?? "—"}</dd></div>
                <div className="min-w-0"><dt className="text-ink-muted">Prochaine visite annoncée</dt><dd className="mt-0.5 tabular text-ink">{v.prochaineVisiteLe ? date(v.prochaineVisiteLe) : "non annoncée"}</dd></div>
                <div className="min-w-0"><dt className="text-ink-muted">Cycle</dt><dd className="mt-0.5 truncate text-ink">{LIBELLE_CYCLE[v.cycle] ?? v.cycle}</dd></div>
                <div className="min-w-0"><dt className="text-ink-muted">Consignée par</dt><dd className="mt-0.5 truncate text-ink">{v.agent} · {date(v.enregistreLe)}</dd></div>
              </dl>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

/* ------------------------------------------------------------------ Feuille de consignation */

function FeuilleVisite({ ouvert, onFermer, etablissements, initiale }: { ouvert: boolean; onFermer: () => void; etablissements: EtablissementCouvert[]; initiale: string | null }) {
  const consigner = useConsignerVisite();
  /** Clé d'idempotence de la session de saisie : renvoyer le formulaire après une réponse perdue ne double pas le fait. */
  const [cle, setCle] = useState(crypto.randomUUID);
  const [choix, setChoix] = useState<string | null | undefined>(undefined);
  const [q, setQ] = useState("");
  const [dateVisite, setDateVisite] = useState(aujourdhuiIso);
  const [objet, setObjet] = useState("");
  const [constats, setConstats] = useState("");
  const [recommandations, setRecommandations] = useState("");
  const [referenceRapport, setReferenceRapport] = useState("");
  const [prochaineVisiteLe, setProchaineVisiteLe] = useState("");

  // Une session se ferme proprement : saisie effacée, refus effacé, clé neuve pour la session suivante.
  const fermer = () => {
    setCle(crypto.randomUUID());
    setChoix(undefined); setQ(""); setDateVisite(aujourdhuiIso()); setObjet(""); setConstats(""); setRecommandations(""); setReferenceRapport(""); setProchaineVisiteLe("");
    consigner.reset();
    onFermer();
  };

  // `undefined` = rien n'a été choisi dans ce formulaire : on reprend l'établissement ouvert dans la liste.
  const etab = etablissements.find((e) => e.id === (choix === undefined ? initiale : choix));
  const suggestions = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return (texte ? etablissements.filter((e) => e.nom.toLowerCase().includes(texte) || (e.commune ?? "").toLowerCase().includes(texte)) : etablissements).slice(0, 20);
  }, [etablissements, q]);

  const valide = !!etab && !!dateVisite && objet.trim().length >= 5 && constats.trim().length >= 10 && (!prochaineVisiteLe || prochaineVisiteLe > dateVisite);

  const envoyez = () => {
    if (!etab || !valide) return;
    consigner.mutate(
      {
        etablissementId: etab.id, dateVisite, objet: objet.trim(), constats: constats.trim(),
        recommandations: recommandations.trim() || null, referenceRapport: referenceRapport.trim() || null,
        prochaineVisiteLe: prochaineVisiteLe || null, cle,
      },
      {
        onSuccess: (r) => {
          notifier({
            ton: "succes",
            titre: r.deja ? "Visite déjà enregistrée" : "Visite consignée",
            texte: r.deja ? `Aucun doublon : cette saisie était déjà au registre pour ${r.etablissement}.` : `Ajoutée au registre pour ${r.etablissement}.`,
          });
          fermer();
        },
        onError: (e) => notifier({ ton: "critique", titre: "Consignation refusée", texte: e instanceof ErreurApi ? e.message : "Écriture impossible pour le moment." }),
      },
    );
  };

  return (
    <Feuille
      ouvert={ouvert} onFermer={fermer} icone={CalendarPlus} titre="Consigner une visite d'inspection"
      description="Un fait sur un établissement : ce qui a été vu, ce qui est recommandé. Rien ici ne décrit un apprenant."
      pied={
        <>
          <Button variante="secondaire" onClick={fermer}>Annuler</Button>
          <Button icone={Stamp} onClick={envoyez} chargement={consigner.isPending} disabled={!valide}>Consigner au registre</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <Champ libelle="Établissement visité">
            {etab ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-blue/40 bg-blue-soft/50 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{etab.nom}</span>
                  <span className="block truncate text-[12px] text-ink-2">{etab.commune ?? "—"} · {LIBELLE_CYCLE[etab.cycle]}</span>
                </span>
                <button type="button" onClick={() => setChoix(null)} className="shrink-0 text-[12.5px] font-semibold text-blue hover:underline">Changer</button>
              </div>
            ) : (
              <>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans votre périmètre" className={input} />
                <ul className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto">
                  {suggestions.map((e) => (
                    <li key={e.id}>
                      <button type="button" onClick={() => { setChoix(e.id); setQ(""); }} className="w-full rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-surface-2">
                        <span className="block truncate text-ink">{e.nom}</span>
                        <span className="block truncate text-[11.5px] text-ink-muted">
                          {e.commune ?? "—"} · {LIBELLE_CYCLE[e.cycle]} · {e.visites === 0 ? "jamais visité" : `${pluriel(e.visites, "visite")}, la dernière le ${e.derniereLe ? date(e.derniereLe) : "—"}`}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!suggestions.length && <li className="px-2.5 py-2 text-[12.5px] text-ink-muted">Aucun établissement de votre périmètre ne correspond à cette recherche.</li>}
                </ul>
              </>
            )}
          </Champ>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Date de la visite"><input type="date" value={dateVisite} max={aujourdhuiIso()} onChange={(e) => setDateVisite(e.target.value)} className={input} /></Champ>
          <Champ libelle="Prochaine visite annoncée" aide="Facultatif — doit suivre la visite consignée">
            <input type="date" value={prochaineVisiteLe} min={dateVisite || undefined} onChange={(e) => setProchaineVisiteLe(e.target.value)} className={input} />
          </Champ>
        </div>

        <Champ libelle="Objet de la visite" aide="En français courant, pas une nomenclature">
          <input value={objet} onChange={(e) => setObjet(e.target.value.slice(0, 200))} placeholder="Suivi de la rentrée et état des salles" className={input} />
        </Champ>

        <Champ libelle="Constats" aide="Ce qui a été constaté sur place — pas une appréciation sur une personne">
          <textarea value={constats} onChange={(e) => setConstats(e.target.value.slice(0, 4000))} rows={4} placeholder="Trois salles sur huit sans tableau ; registre d'appel tenu à jour ; deux enseignants absents sans signalement." className={cn(input, "h-auto resize-y py-2 leading-snug")} />
        </Champ>

        <Champ libelle="Recommandations" aide="Facultatif">
          <textarea value={recommandations} onChange={(e) => setRecommandations(e.target.value.slice(0, 4000))} rows={3} placeholder="Équiper les salles manquantes avant la fin du trimestre ; rappeler la tenue de l'appel." className={cn(input, "h-auto resize-y py-2 leading-snug")} />
        </Champ>

        <Champ libelle="Référence du rapport" aide="Facultatif — cote du document, papier ou numérisé">
          <input value={referenceRapport} onChange={(e) => setReferenceRapport(e.target.value.slice(0, 80))} placeholder="INS-2026-041" className={input} />
        </Champ>

        {consigner.error && (
          <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">
            {consigner.error instanceof ErreurApi ? consigner.error.message : "Écriture impossible pour le moment."}
          </p>
        )}
        <p className="flex gap-2 rounded-md bg-surface-2/70 px-3 py-2 text-[12px] leading-snug text-ink-2">
          <Stamp size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-muted" />
          <span>Le fait est enregistré en ajout seul, avec votre identité d'agent et l'établissement. Il ne se corrige pas : une nouvelle visite cite la précédente dans ses constats.</span>
        </p>
      </div>
    </Feuille>
  );
}

function Champ({ libelle, aide, children }: { libelle: string; aide?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink">{libelle}</span>
      {children}
      {aide && <span className="mt-1 block text-[11.5px] leading-snug text-ink-muted">{aide}</span>}
    </label>
  );
}
