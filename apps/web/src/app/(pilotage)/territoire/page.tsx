"use client";

import type { CodeIndicateur } from "@beile/contracts";
import {
  Activity, ArrowRight, BellRing, Check, Clock, Droplet, GraduationCap, Landmark, Map as IconeCarte, Radio, School, TriangleAlert, UserX, Users, Wifi, Zap, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarresClassees } from "@/components/charts/Graphiques";
import { AnimatePresence, Cascade, Compteur, EASE, Element, motion } from "@/components/motion";
import { CarteBenin, COULEUR_ALERTE, type PointCarte } from "@/components/map/CarteBenin";
import { notifier } from "@/components/ui/Notifications";
import { BadgeConfiance, TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { compact, dateLongue, entier, heure, nombre, pourcent } from "@/lib/format";
import {
  useAbsencesTerritoire, useComplementsTerritoire, useFicheCommune, useIndicateurPilotage, usePrioritesPilotage, useRelanceMutation, useTerritoire,
  type ConsoleTerritoriale, type EtablissementTerritoire, type Infrastructures,
} from "@/lib/api/pilotage";
import {
  ALERTE, EtatEchec, Feuille, ilYa, LegendeAlertes, niveauDuScore, nomCommune, pluriel, SqueletteLignes, SqueletteTuiles, useMaintenant,
} from "../_commun";

/**
 * Console territoriale (P3) : inspecteur de circonscription et direction départementale.
 * Indicateurs calculés par la couche sémantique sous le périmètre de l'habilitation (GET /pilotage/territoire),
 * absences du jour lues en direct dans le registre (rafraîchies toutes les 30 s).
 */

type Classement = Extract<CodeIndicateur, "taux_occupation" | "ratio_apprenants_enseignant" | "taux_seuil_moyenne" | "taux_absenteisme">;
const CLASSEMENTS: { valeur: Classement; libelle: string }[] = [
  { valeur: "taux_occupation", libelle: "Occupation" },
  { valeur: "ratio_apprenants_enseignant", libelle: "Élèves / ens." },
  { valeur: "taux_seuil_moyenne", libelle: "Maths ≥ 15" },
  { valeur: "taux_absenteisme", libelle: "Absentéisme" },
];
const occupationDe = (e: { effectif: number; capacite: number }) => (e.effectif / Math.max(1, e.capacite)) * 100;

export default function ConsoleTerritorialePage() {
  const territoire = useTerritoire();
  if (territoire.isPending) return <Chargement />;
  if (territoire.isError) {
    return (
      <div className="space-y-6">
        <PageHeader surtitre="Console territoriale · P3" titre="Console territoriale" />
        <EtatEchec erreur={territoire.error} onReessayer={() => territoire.refetch()} titreRefus="Console réservée aux périmètres territoriaux" />
        <Card className="min-w-0">
          <EtatVide icone={Landmark} titre="Vous avez un périmètre national ?" texte="Le cockpit et la carte « Où agir ? » couvrent l'ensemble du pays." action={<Link href="/cockpit"><Button variante="secondaire" icone={ArrowRight}>Ouvrir le cockpit</Button></Link>} />
        </Card>
      </div>
    );
  }
  return <Console t={territoire.data} />;
}

function Chargement() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2"><Squelette className="h-3 w-64" /><Squelette className="h-8 w-72 max-w-full" /></div>
      <SqueletteTuiles n={6} className="xl:grid-cols-6" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Squelette className="h-[480px] rounded-xl" />
        <Card className="min-w-0 lg:col-span-2"><SqueletteLignes n={8} /></Card>
      </div>
    </div>
  );
}

function Console({ t }: { t: ConsoleTerritoriale }) {
  const router = useRouter();
  const inspecteur = t.perimetre.niveau === "circonscription";
  const complements = useComplementsTerritoire();
  const prio = usePrioritesPilotage();
  const ref = complements.data?.references;
  const r = t.indicateurs;
  const libelle = inspecteur ? `Circonscription de ${t.perimetre.libelle.replace(/^CS /, "")}` : t.perimetre.libelle;

  // Inspecteur : les établissements de la circonscription sont localisés sur la carte (fiche de sa commune).
  const communeCirco = inspecteur && t.communes.length === 1 ? t.communes[0]!.id : null;
  const fiche = useFicheCommune(communeCirco);
  const points: PointCarte[] | undefined = fiche.data?.etablissements.map((e) => ({ id: e.id, lng: e.lng, lat: e.lat, libelle: e.nom, mis: e.pilote }));

  const couleurs = useMemo(() => new Map(t.communes.map((c) => [c.id, COULEUR_ALERTE[c.priorite]])), [t.communes]);
  const scores = useMemo(() => new Map(Object.entries(prio.data?.communes ?? {}).map(([id, p]) => [id, p.score])), [prio.data]);
  const attendus = r.effectif.couverture.etablissementsAttendus;
  const ayantTransmis = r.effectif.couverture.etablissementsAyantTransmis;

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Console territoriale · P3 · ${dateLongue(t.date)}`}
        titre={libelle}
        sousTitre="Indicateurs calculés par la couche sémantique nationale, restreints au périmètre de votre habilitation : la direction centrale obtient le même chiffre pour le même territoire."
        actions={!inspecteur ? <Link href="/cockpit/carte"><Button data-guide="territoire-carte-lien" icone={ArrowRight}>Où agir ?</Button></Link> : <Link href={`/cockpit/carte?commune=${communeCirco ?? ""}`}><Button data-guide="territoire-carte-lien" variante="secondaire" icone={IconeCarte}>Voir sur la carte</Button></Link>}
      />

      <Cascade data-guide="territoire-indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Element><TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={r.effectif.valeur ?? 0} format={compact} />} indice={<span>{entier(attendus)} établissements</span>} confiance={r.effectif.confiance} /></Element>
        <Element><TuileIndicateur libelle="Occupation" icone={School} accent={(r.occupation.valeur ?? 0) > 112 ? "critique" : "ambre"} valeur={<Compteur valeur={r.occupation.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%" indice={ref ? <span>national : {pourcent(ref.occupation)}</span> : undefined} confiance={r.occupation.confiance} /></Element>
        <Element><TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={<Compteur valeur={r.ratio.valeur ?? 0} format={(v) => nombre(v, 1)} />} indice={ref ? <span>national : {nombre(ref.ratio, 1)}</span> : undefined} confiance={r.ratio.confiance} /></Element>
        <Element><TuileIndicateur libelle="Maths ≥ 15/20" icone={Activity} accent="bleu" valeur={<Compteur valeur={r.maths.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%" indice={ref ? <span>national : {pourcent(ref.maths)}</span> : undefined} confiance={r.maths.confiance} /></Element>
        <Element><TuileIndicateur libelle="Absentéisme" icone={UserX} accent="ambre" valeur={<Compteur valeur={r.absenteisme.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%" indice={ref ? <span>national : {pourcent(ref.absenteisme)}</span> : undefined} confiance={r.absenteisme.confiance} /></Element>
        <Element><TuileIndicateur libelle="Abandon" icone={TriangleAlert} accent="critique" valeur={<Compteur valeur={r.abandon.valeur ?? 0} format={(v) => nombre(v, 1)} />} unite="%" indice={<span>provisoire {r.abandon.periode}</span>} confiance={r.abandon.confiance} /></Element>
      </Cascade>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card data-guide="territoire-carte" className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-line/60 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Niveaux de priorité</h2>
            <p className="text-[12.5px] text-ink-muted">
              {inspecteur ? "Votre circonscription est mise en évidence ; les points sont ses établissements." : "Cliquez sur une commune pour descendre jusqu'à ses établissements."}
            </p>
          </div>
          <div className="p-5">
            <CarteBenin
              focusDepartement={t.departementId ?? undefined}
              couleurs={couleurs}
              valeurs={scores}
              libelleValeur="Niveau"
              formater={(v) => `${ALERTE[niveauDuScore(v)].symbole} ${ALERTE[niveauDuScore(v)].libelle} · ${pluriel(v, "facteur")}`}
              selection={communeCirco}
              onSelect={inspecteur ? undefined : (id) => { if (couleurs.has(id)) router.push(`/cockpit/carte?commune=${id}`); }}
              points={points}
              hauteur={480}
              className="mx-auto w-full max-w-[340px]"
              legende={<LegendeAlertes avecPoints={!!points} />}
            />
          </div>
        </Card>

        <div className="min-w-0 space-y-6 lg:col-span-2">
          <AbsencesDuJour />
          {inspecteur ? (
            <PointsAttention etabs={t.etablissements} infra={complements.data?.etablissements} />
          ) : (
            <ClassementCommunes libelle={libelle} references={r} onCommune={(id) => router.push(`/cockpit/carte?commune=${id}`)} />
          )}
        </div>
      </div>

      {inspecteur ? (
        <TableauCirconscription etabs={t.etablissements} infra={complements.data?.etablissements} />
      ) : (
        <Retardataires etabs={t.etablissements.filter((e) => !e.transmis)} attendus={attendus} nonTransmis={attendus - ayantTransmis} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Absences du jour (30 s) */

function AbsencesDuJour() {
  const q = useAbsencesTerritoire();
  const maintenant = useMaintenant(15_000);
  const d = q.data;
  const suivis = d?.etablissements.reduce((s, e) => s + e.suivis, 0) ?? 0;
  const absents = d?.etablissements.reduce((s, e) => s + e.absents, 0) ?? 0;
  const derniere = d?.etablissements.map((e) => e.derniereSaisie).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const tauxMax = Math.max(5, ...(d?.etablissements.map((e) => e.taux) ?? [0]));

  return (
    <Card data-guide="territoire-absences" className="min-w-0">
      <CardHeader
        icon={Radio}
        title="Absences du jour · en direct"
        subtitle={d ? `Registre des appels · actualisé ${ilYa(d.horodatage, maintenant)} (toutes les 30 s)` : "Registre des appels · actualisation toutes les 30 s"}
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
      {q.isPending ? (
        <SqueletteLignes n={4} />
      ) : q.isError && !d ? (
        <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} className="border-0 p-0 shadow-none" />
      ) : d && d.etablissements.length ? (
        <div className="grid gap-5 sm:grid-cols-[minmax(0,13rem)_1fr]">
          <div className="rounded-lg bg-surface-2/70 px-4 py-3.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Taux d'absence du jour</p>
            <p aria-live="polite" className="mt-2 font-display text-[36px] font-bold leading-none text-ink">
              <Compteur valeur={(absents / Math.max(1, suivis)) * 100} format={(v) => nombre(v, 1)} /><span className="ml-1 text-[16px] font-semibold text-ink-muted">%</span>
            </p>
            <p className="mt-2 text-xs text-ink-2 tabular">{pluriel(absents, "absent")} sur {entier(suivis)} apprenants suivis</p>
            <p className="mt-1 text-xs text-ink-muted">{derniere ? `Dernière saisie à ${heure(derniere)} (${ilYa(derniere, maintenant)})` : "Aucun appel enregistré aujourd'hui"}</p>
          </div>
          <ul className="min-w-0 divide-y divide-line/60">
            <AnimatePresence initial={false}>
              {d.etablissements.map((e) => (
                <motion.li key={e.etablissementId ?? e.etablissement} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="flex items-center gap-3 py-2.5">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", e.absents ? "bg-warning" : "bg-success")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{e.etablissement}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <motion.span className={cn("block h-full rounded-full", e.taux > 10 ? "bg-critical" : "bg-warning")} initial={false} animate={{ width: `${Math.max(e.absents ? 2 : 0, (e.taux / tauxMax) * 100)}%` }} transition={{ duration: 0.8, ease: EASE }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold text-ink tabular">{pourcent(e.taux)}</span>
                    <span className="block text-xs text-ink-muted tabular">{e.absents}/{entier(e.suivis)}{e.derniereSaisie ? ` · ${heure(e.derniereSaisie)}` : ""}</span>
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ) : (
        <EtatVide icone={Radio} titre="Aucun établissement suivi" texte="Aucun établissement de votre périmètre ne tient encore son registre d'appel dans BEILE." />
      )}
      <div className="mt-4 rounded-md border border-info/25 bg-info-bg/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <span className="font-semibold text-info">Un fait, quatre restitutions.</span> L'appel saisi par l'enseignant crée un événement « Absence » : il notifie le parent, s'inscrit chez la direction, fait bouger ce taux et apparaît au cockpit national, sans ressaisie.
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Direction départementale : classement des communes */

function ClassementCommunes({ libelle, references, onCommune }: { libelle: string; references: ConsoleTerritoriale["indicateurs"]; onCommune: (id: string) => void }) {
  const [classement, setClassement] = useState<Classement>("taux_occupation");
  const q = useIndicateurPilotage({ indicateur: classement, filtres: classement === "taux_seuil_moyenne" ? { matiere: "Mathématiques", seuil: 15 } : {}, ventilation: ["commune"] });
  const ref = { taux_occupation: references.occupation, ratio_apprenants_enseignant: references.ratio, taux_seuil_moyenne: references.maths, taux_absenteisme: references.absenteisme }[classement];
  const formater = (v: number) => (classement === "ratio_apprenants_enseignant" ? nombre(v, 0) : pourcent(v));
  return (
    <Card data-guide="territoire-classement" className="min-w-0">
      <CardHeader
        icon={IconeCarte}
        title="Classement des communes"
        subtitle={`${libelle} · trait vertical : valeur du territoire`}
        action={q.data ? <BadgeConfiance confiance={q.data.confiance} /> : undefined}
      />
      <div className="mb-3 max-w-full overflow-x-auto">
        <div className="w-max"><Segmente label="Indicateur de classement" options={CLASSEMENTS} valeur={classement} onChange={setClassement} /></div>
      </div>
      {q.isError ? (
        <EtatEchec erreur={q.error} onReessayer={() => q.refetch()} className="border-0 p-0 shadow-none" />
      ) : !q.data ? (
        <SqueletteLignes n={8} />
      ) : (
        <div className={cn("transition-opacity", q.isFetching && "opacity-60")}>
          <BarresClassees
            key={classement}
            barres={[...q.data.lignes].sort((a, b) => (b.valeur ?? -1) - (a.valeur ?? -1)).map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.valeur, masquee: l.masquee, effectif: l.effectif }))}
            formater={formater}
            reference={ref.valeur != null ? { valeur: ref.valeur, libelle: "Valeur du territoire" } : undefined}
            onSelect={onCommune}
          />
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Inspecteur : points d'attention */

function PointsAttention({ etabs, infra }: { etabs: EtablissementTerritoire[]; infra?: { id: string; infrastructures: Infrastructures }[] }) {
  const satures = etabs.filter((e) => occupationDe(e) > 110).length;
  const surcharges = etabs.filter((e) => e.effectif / Math.max(1, e.enseignants) > 54).length;
  const retard = etabs.filter((e) => !e.transmis).length;
  const sansEau = infra ? infra.filter((e) => !e.infrastructures.eau).length : null;
  const items: { libelle: string; valeur: number | null; detail: string; grave: boolean }[] = [
    { libelle: "Saturés", valeur: satures, detail: "occupation au-delà de 110 %", grave: satures > etabs.length / 2 },
    { libelle: "Classes surchargées", valeur: surcharges, detail: "plus de 54 élèves par enseignant", grave: surcharges > 0 },
    { libelle: "Sans transmission", valeur: retard, detail: "remontée de l'année non reçue", grave: retard > 0 },
    { libelle: "Sans point d'eau", valeur: sansEau, detail: "infrastructure déclarée absente", grave: sansEau != null && sansEau > etabs.length / 4 },
  ];
  return (
    <Card data-guide="territoire-attention" className="min-w-0">
      <CardHeader icon={TriangleAlert} title="Points d'attention de la circonscription" subtitle={`Sur ${pluriel(etabs.length, "établissement")} du référentiel`} />
      <Cascade className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map((i) => (
          <Element key={i.libelle}>
            <div className={cn("rounded-md px-3 py-2.5", i.grave ? "bg-warning-bg" : "bg-surface-2/70")}>
              <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{i.libelle}</span>
              <div className={cn("mt-1 flex items-center gap-1.5 font-display text-2xl font-semibold", i.grave ? "text-warning" : "text-ink")}>
                {i.grave && <TriangleAlert size={15} aria-hidden />}{i.valeur == null ? <Squelette className="h-6 w-10" /> : <Compteur valeur={i.valeur} format={entier} />}
              </div>
              <span className="block text-xs leading-snug text-ink-muted">{i.detail}</span>
            </div>
          </Element>
        ))}
      </Cascade>
    </Card>
  );
}

/* ------------------------------------------------------------------ Inspecteur : établissements de la circonscription */

const PAGE = 15;

function TableauCirconscription({ etabs, infra }: { etabs: EtablissementTerritoire[]; infra?: { id: string; infrastructures: Infrastructures }[] }) {
  const [limite, setLimite] = useState(PAGE);
  const [relances, setRelances] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const relance = useRelanceMutation();
  const infraDe = useMemo(() => new Map(infra?.map((x) => [x.id, x.infrastructures]) ?? []), [infra]);
  const retard = etabs.filter((e) => !e.transmis).length;
  const lignes = etabs.slice(0, limite);

  const relancer = (id: string, nom: string) => {
    setEnCours(id);
    relance.mutate([id], {
      onSuccess: (r) => {
        setRelances((s) => new Set(s).add(id));
        notifier({ ton: "succes", titre: r.relances ? "Relance envoyée" : "Relance déjà en cours", texte: `${nom} : demande « Transmettre la remontée » (échéance 7 jours).` });
      },
      onSettled: () => setEnCours(null),
    });
  };
  const action = (e: EtablissementTerritoire) => e.transmis ? (
    <Badge ton="succes" icone={Check}>Transmis</Badge>
  ) : relances.has(e.id) ? (
    <Badge ton="info" icone={BellRing}>Relancé</Badge>
  ) : (
    <span className="flex flex-wrap items-center justify-end gap-2">
      <Badge ton="avertissement" icone={Clock}>Non transmis</Badge>
      <Button taille="sm" variante="secondaire" icone={BellRing} chargement={enCours === e.id} onClick={() => relancer(e.id, e.nom)} aria-label={`Relancer ${e.nom}`}>Relancer</Button>
    </span>
  );

  return (
    <Card data-guide="territoire-etablissements" className="min-w-0 overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Établissements de la circonscription</h2>
          <p className="text-[12.5px] text-ink-muted">Retardataires en tête, puis par taux d'occupation décroissant.</p>
        </div>
        <Badge ton={retard ? "avertissement" : "succes"} icone={retard ? Clock : Check}>{retard} sur {etabs.length} n'ont pas transmis</Badge>
      </div>

      <ul className="grid gap-3 p-4 sm:grid-cols-2 md:hidden">
        {lignes.map((e) => {
          const occ = occupationDe(e);
          return (
            <li key={e.id} className={cn("rounded-lg border border-line/70 bg-surface p-3.5", !e.transmis && "bg-warning-bg/40")}>
              <p className="font-medium text-ink">{e.nom} {e.pilote && <Badge ton="marque" className="ml-1">Pilote</Badge>}</p>
              <p className="text-xs text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {nomCommune(e.communeId)}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Effectif</dt><dd className="font-semibold text-ink tabular">{entier(e.effectif)}</dd></div>
                <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Occupation</dt><dd className={cn("font-semibold tabular", occ > 110 ? "text-critical" : "text-ink")}>{pourcent(occ, 0)}</dd></div>
                <div className="rounded-md bg-surface-2/70 py-1.5"><dt className="text-ink-muted">Enseignants</dt><dd className="font-semibold text-ink tabular">{entier(e.enseignants)}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">{infraDe.get(e.id) ? <Infras i={infraDe.get(e.id)!} /> : <span />}{action(e)}</div>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Établissements de la circonscription, avec occupation, enseignants, infrastructures et transmission</caption>
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold">Établissement</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Effectif</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Occupation</th>
              <th scope="col" className="hidden px-5 py-3 text-right font-semibold lg:table-cell">Enseignants</th>
              <th scope="col" className="hidden px-5 py-3 text-right font-semibold lg:table-cell">Élèves / ens.</th>
              <th scope="col" className="px-5 py-3 font-semibold">Infrastructures</th>
              <th scope="col" className="px-5 py-3 text-right font-semibold">Transmission</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {lignes.map((e, i) => {
                const occ = occupationDe(e);
                return (
                  <motion.tr key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3 }} className={cn("border-t border-line/60", !e.transmis && "bg-warning-bg/40")}>
                    <td className="min-w-[12rem] px-5 py-3">
                      <span className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-ink">{e.nom}</span>{e.pilote && <Badge ton="marque">Pilote</Badge>}</span>
                      <span className="block text-xs text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {nomCommune(e.communeId)}</span>
                    </td>
                    <td className="px-5 py-3 text-right">{entier(e.effectif)}</td>
                    <td className={cn("px-5 py-3 text-right", occ > 110 ? "font-semibold text-critical" : "text-ink")}>{pourcent(occ, 0)}{occ > 110 && <span className="sr-only"> (saturé)</span>}</td>
                    <td className="hidden px-5 py-3 text-right lg:table-cell">{entier(e.enseignants)}</td>
                    <td className="hidden px-5 py-3 text-right lg:table-cell">{nombre(e.effectif / Math.max(1, e.enseignants), 0)}</td>
                    <td className="px-5 py-3">{infraDe.get(e.id) ? <Infras i={infraDe.get(e.id)!} /> : <Squelette className="h-6 w-20" />}</td>
                    <td className="px-5 py-3 text-right">{action(e)}</td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
      {etabs.length > PAGE && (
        <div className="border-t border-line/60 px-5 py-3">
          <button type="button" onClick={() => setLimite((l) => (l >= etabs.length ? PAGE : etabs.length))} className="min-h-10 text-[13px] font-medium text-blue hover:underline">
            {limite >= etabs.length ? "Réduire la liste" : `Afficher les ${etabs.length} établissements`}
          </button>
        </div>
      )}
      <p className="border-t border-line/60 px-5 py-3 text-xs text-ink-muted">Un établissement qui n'a pas transmis fait baisser l'indice de confiance de tous les chiffres du territoire. Chaque relance ouvre une demande suivie, visible par sa direction, et elle est journalisée.</p>
    </Card>
  );
}

function Infras({ i }: { i: Infrastructures }) {
  return (
    <span className="flex gap-1">
      <Infra present={i.eau} icone={Droplet} libelle="Eau" />
      <Infra present={i.electricite} icone={Zap} libelle="Électricité" />
      <Infra present={i.internet} icone={Wifi} libelle="Internet" />
    </span>
  );
}

function Infra({ present, icone: Icone, libelle }: { present: boolean; icone: LucideIcon; libelle: string }) {
  return (
    <span title={`${libelle} : ${present ? "disponible" : "absent"}`} className={cn("relative inline-flex h-6 w-6 items-center justify-center rounded-full", present ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")}>
      <Icone size={12} aria-hidden />
      {!present && <span className="absolute h-px w-4 rotate-45 bg-current" aria-hidden />}
      <span className="sr-only">{libelle} : {present ? "disponible" : "absent"}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ Direction départementale : retardataires */

function Retardataires({ etabs, attendus, nonTransmis }: { etabs: EtablissementTerritoire[]; attendus: number; nonTransmis: number }) {
  const [relancees, setRelancees] = useState<Set<string>>(new Set());
  const [cible, setCible] = useState<{ communeId: string; etabs: EtablissementTerritoire[] } | null>(null);
  const relance = useRelanceMutation();
  const parCommune = [...etabs.reduce((m, e) => m.set(e.communeId, [...(m.get(e.communeId) ?? []), e]), new Map<string, EtablissementTerritoire[]>())]
    .sort((a, b) => b[1].length - a[1].length || nomCommune(a[0]).localeCompare(nomCommune(b[0]), "fr"));

  const confirmer = () => {
    if (!cible) return;
    relance.mutate(cible.etabs.map((e) => e.id).slice(0, 200), {
      onSuccess: (r) => {
        setRelancees((s) => new Set(s).add(cible.communeId));
        notifier({ ton: "succes", titre: `${nomCommune(cible.communeId)} : ${pluriel(r.relances, "relance envoyée", "relances envoyées")}`, texte: r.dejaOuvertes ? `${pluriel(r.dejaOuvertes, "relance était", "relances étaient")} déjà en cours.` : undefined });
        setCible(null);
      },
    });
  };

  return (
    <Card data-guide="territoire-retardataires" className="min-w-0">
      <CardHeader
        icon={Clock}
        title="Établissements n'ayant pas transmis"
        subtitle={`${entier(nonTransmis)} sur ${entier(attendus)} (${pourcent((nonTransmis / Math.max(1, attendus)) * 100)}) · ils abaissent l'indice de confiance du territoire`}
      />
      {parCommune.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {parCommune.map(([id, liste], i) => {
            const fait = relancees.has(id);
            return (
              <motion.li key={id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3, ease: EASE }} className="flex items-center justify-between gap-3 rounded-md bg-surface-2/70 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{nomCommune(id)}</span>
                  <span className="text-xs text-warning">{pluriel(liste.length, "établissement")} en retard</span>
                </span>
                <Button taille="sm" variante={fait ? "fantome" : "secondaire"} icone={fait ? Check : BellRing} disabled={fait} onClick={() => setCible({ communeId: id, etabs: liste })} aria-label={`Relancer les établissements de ${nomCommune(id)}`}>
                  {fait ? "Relancés" : "Relancer"}
                </Button>
              </motion.li>
            );
          })}
        </ul>
      ) : (
        <EtatVide icone={Check} titre="Tous les établissements ont transmis" texte="L'indice de confiance du territoire n'est pas pénalisé par la couverture." />
      )}
      {nonTransmis > etabs.length && <p className="mt-3 text-xs text-ink-muted">Liste limitée aux {entier(etabs.length)} premiers établissements en retard renvoyés par le serveur.</p>}

      <Feuille
        ouvert={!!cible}
        onFermer={() => setCible(null)}
        icone={BellRing}
        titre={cible ? `Relancer ${pluriel(cible.etabs.length, "établissement")} de ${nomCommune(cible.communeId)} ?` : ""}
        description="Une demande « Transmettre la remontée » (échéance 7 jours) sera ouverte pour chacun, visible par sa direction. L'action est journalisée."
        pied={
          <>
            <Button variante="secondaire" onClick={() => setCible(null)}>Annuler</Button>
            <Button icone={BellRing} chargement={relance.isPending} onClick={confirmer}>Envoyer les relances</Button>
          </>
        }
      >
        <ul className="divide-y divide-line/60 text-sm">
          {cible?.etabs.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2"><span className="truncate text-ink">{e.nom}</span><span className="shrink-0 font-mono text-xs text-ink-muted">{e.id}</span></li>
          ))}
          {cible && cible.etabs.length > 12 && <li className="py-2 text-xs text-ink-muted">… et {cible.etabs.length - 12} autres</li>}
        </ul>
      </Feuille>
    </Card>
  );
}
