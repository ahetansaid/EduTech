"use client";

import type { Evenement, Perimetre, ResultatIndicateur } from "@beile/contracts";
import {
  Activity, ArrowRight, BellRing, Check, Clock, GraduationCap, Landmark, Map as IconeCarte, Radio, School, TriangleAlert, UserX, Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BarresClassees } from "@/components/charts/Graphiques";
import { CarteBenin, COULEUR_ALERTE, type PointCarte } from "@/components/map/CarteBenin";
import { BadgeConfiance, TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { nomCommune, useCouches } from "@/lib/donnees";
import { compact, dateLongue, entier, heure, nombre, pourcent } from "@/lib/format";
import { ANNEE_COURANTE, type EtablissementGenere } from "@beile/simulation/macro";
import { DATE_SIMULEE, ETAB_RONIERS } from "@beile/simulation/micro";
import { calculer, communesDuPerimetre, priorites, type NiveauAlerte } from "@beile/simulation/semantique";
import { departementById } from "@beile/simulation/territoire";
import { useDemo, useMonde, useProfil } from "@/lib/store";

/**
 * Console territoriale (P3) : inspecteur de circonscription et direction départementale.
 * Tous les chiffres passent par la couche sémantique, restreinte au périmètre de l'habilitation.
 */

type Classement = "taux_occupation" | "ratio_apprenants_enseignant" | "taux_seuil_moyenne" | "taux_absenteisme";
const CLASSEMENTS: { valeur: Classement; libelle: string }[] = [
  { valeur: "taux_occupation", libelle: "Occupation" },
  { valeur: "ratio_apprenants_enseignant", libelle: "Élèves / ens." },
  { valeur: "taux_seuil_moyenne", libelle: "Maths ≥ 15" },
  { valeur: "taux_absenteisme", libelle: "Absentéisme" },
];
const SYMBOLE: Record<NiveauAlerte, string> = { critique: "◆", attention: "▲", surveillance: "◐", favorable: "●" };
const LIBELLE_ALERTE: Record<NiveauAlerte, string> = { critique: "Critique", attention: "Attention", surveillance: "Surveillance", favorable: "Situation favorable" };
const JOUR = DATE_SIMULEE.slice(0, 10);

export default function ConsoleTerritoriale() {
  const profil = useProfil();
  const hab = profil.habilitations.find((h) => h.role === "inspecteur" || h.role === "direction_departementale");
  if (!hab) {
    return <Card><EtatVide icone={Landmark} titre="Aucune habilitation territoriale" texte="La console territoriale est réservée aux inspecteurs de circonscription et aux directions départementales." /></Card>;
  }
  return <Console perimetre={hab.perimetre} inspecteur={hab.role === "inspecteur"} />;
}

function Console({ perimetre, inspecteur }: { perimetre: Perimetre; inspecteur: boolean }) {
  const couches = useCouches();
  const router = useRouter();
  const [classement, setClassement] = useState<Classement>("taux_occupation");

  const communes = useMemo(() => communesDuPerimetre(perimetre) ?? new Set<string>(), [perimetre]);
  const libellePerimetre = perimetre.niveau === "circonscription" ? `Circonscription de ${perimetre.circonscription.replace(/^CS /, "")}`
    : perimetre.niveau === "departement" ? `Département ${departementById.get(perimetre.departementId)?.nom ?? perimetre.departementId}` : "Périmètre";

  const r = useMemo(() => {
    const req = (indicateur: Classement | "effectif_apprenants" | "taux_abandon", filtres = {}): ResultatIndicateur => calculer(couches, { indicateur, filtres, ventilation: [] }, perimetre);
    return {
      effectif: req("effectif_apprenants"),
      ratio: req("ratio_apprenants_enseignant"),
      occupation: req("taux_occupation"),
      absenteisme: req("taux_absenteisme"),
      maths: req("taux_seuil_moyenne", { matiere: "Mathématiques", seuil: 15 }),
      abandon: req("taux_abandon"),
    };
  }, [couches, perimetre]);
  const national = useMemo(() => ({
    maths: calculer(couches, { indicateur: "taux_seuil_moyenne", filtres: { matiere: "Mathématiques", seuil: 15 }, ventilation: [] }).valeur,
    ratio: calculer(couches, { indicateur: "ratio_apprenants_enseignant", filtres: {}, ventilation: [] }).valeur,
  }), [couches]);

  const parCommune = useMemo(() => calculer(couches, {
    indicateur: classement, filtres: classement === "taux_seuil_moyenne" ? { matiere: "Mathématiques", seuil: 15 } : {}, ventilation: ["commune"],
  }, perimetre), [couches, classement, perimetre]);
  const refClassement = { taux_occupation: r.occupation, ratio_apprenants_enseignant: r.ratio, taux_seuil_moyenne: r.maths, taux_absenteisme: r.absenteisme }[classement];

  const etabs = useMemo(() => [...communes].flatMap((id) => couches.etablissementsParCommune.get(id) ?? []), [couches, communes]);
  const nonTransmis = etabs.filter((e) => !e.transmis);

  const prio = useMemo(() => priorites(couches), [couches]);
  const couleurs = useMemo(() => new Map([...prio].map(([id, p]) => [id, COULEUR_ALERTE[p.niveau]])), [prio]);
  const scores = useMemo(() => new Map([...prio].map(([id, p]) => [id, p.score])), [prio]);
  const communeCirco = inspecteur ? [...communes][0] ?? null : null;
  const points: PointCarte[] = (inspecteur ? etabs : etabs.filter((e) => e.id.includes("-PILOTE-")))
    .map((e) => ({ id: e.id, lng: e.lng, lat: e.lat, libelle: e.nom, mis: e.id.includes("-PILOTE-") }));

  const pct = (v: number | null, d = 1) => nombre(v, d);
  const formaterClassement = (v: number) => (classement === "ratio_apprenants_enseignant" ? nombre(v, 0) : pourcent(v));

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre={`Console territoriale · P3 · ${dateLongue(DATE_SIMULEE)}`}
        titre={libellePerimetre}
        sousTitre="Indicateurs calculés par la couche sémantique nationale, restreints au périmètre de votre habilitation : la direction centrale obtient le même chiffre pour le même territoire."
        actions={!inspecteur ? <Link href="/cockpit/carte"><Button icone={ArrowRight}>Où agir ?</Button></Link> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={compact(r.effectif.valeur ?? 0)} indice={<span>{entier(etabs.length)} établissements</span>} confiance={r.effectif.confiance} />
        <TuileIndicateur libelle="Occupation" icone={School} accent={(r.occupation.valeur ?? 0) > 112 ? "critique" : "ambre"} valeur={pct(r.occupation.valeur)} unite="%" confiance={r.occupation.confiance} />
        <TuileIndicateur libelle="Élèves / enseignant" icone={GraduationCap} accent="sarcelle" valeur={pct(r.ratio.valeur)} indice={<span>national : {nombre(national.ratio, 1)}</span>} confiance={r.ratio.confiance} />
        <TuileIndicateur libelle="Maths ≥ 15/20" icone={Activity} accent="bleu" valeur={pct(r.maths.valeur)} unite="%" indice={<span>national : {pourcent(national.maths)}</span>} confiance={r.maths.confiance} />
        <TuileIndicateur libelle="Absentéisme" icone={UserX} accent="ambre" valeur={pct(r.absenteisme.valeur)} unite="%" confiance={r.absenteisme.confiance} />
        <TuileIndicateur libelle="Abandon" icone={TriangleAlert} accent="critique" valeur={pct(r.abandon.valeur)} unite="%" indice={<span>provisoire {ANNEE_COURANTE}</span>} confiance={r.abandon.confiance} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <Card className="p-0">
          <div className="border-b border-line/60 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Borgou · niveaux de priorité</h2>
            <p className="text-[12.5px] text-ink-muted">
              {inspecteur ? "Votre circonscription est mise en évidence ; les points sont ses établissements." : "Cliquez sur une commune pour descendre jusqu'à ses établissements."}
            </p>
          </div>
          <div className="p-5">
            <CarteBenin
              focusDepartement="borgou"
              couleurs={couleurs}
              valeurs={scores}
              libelleValeur="Niveau"
              formater={(v) => { const n = v >= 3 ? "critique" : v === 2 ? "attention" : v === 1 ? "surveillance" : "favorable"; return `${SYMBOLE[n]} ${LIBELLE_ALERTE[n]} · ${v} facteur${v > 1 ? "s" : ""}`; }}
              selection={communeCirco}
              onSelect={inspecteur ? undefined : (id) => router.push(`/cockpit/carte?commune=${id}`)}
              points={points}
              hauteur={480}
              className="mx-auto w-full max-w-[340px]"
              legende={
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-ink-2">
                  {(Object.keys(SYMBOLE) as NiveauAlerte[]).map((n) => (
                    <span key={n} className="inline-flex items-center gap-1.5">
                      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-[9px] leading-none text-white" style={{ background: COULEUR_ALERTE[n] }} aria-hidden>{SYMBOLE[n]}</span>{LIBELLE_ALERTE[n]}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-surface bg-amber" aria-hidden />Établissement pilote</span>
                </div>
              }
            />
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          <EtablissementsPilotes communes={communes} />
          {inspecteur && <PointsAttention etabs={etabs} />}
          {!inspecteur && (
            <Card>
              <CardHeader
                icon={IconeCarte}
                title="Classement des communes"
                subtitle={`${libellePerimetre} · ${ANNEE_COURANTE} · trait vertical : valeur du département`}
                action={<BadgeConfiance confiance={parCommune.confiance} />}
              />
              <div className="mb-3 max-w-full overflow-x-auto">
                <Segmente label="Indicateur de classement" options={CLASSEMENTS} valeur={classement} onChange={setClassement} />
              </div>
              <BarresClassees
                barres={parCommune.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle, valeur: l.valeur, masquee: l.masquee, effectif: l.effectif }))}
                formater={formaterClassement}
                reference={refClassement.valeur != null ? { valeur: refClassement.valeur, libelle: "Valeur du département" } : undefined}
                onSelect={(id) => router.push(`/cockpit/carte?commune=${id}`)}
              />
            </Card>
          )}
        </div>
      </div>

      {inspecteur ? (
        <TableauCirconscription etabs={etabs} />
      ) : (
        <Retardataires etabs={nonTransmis} total={etabs.length} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Établissements pilotes : un fait, quatre restitutions */

function statsPilote(evenements: Evenement[], etabId: string) {
  // Projection de l'état courant à partir du registre : où est chaque apprenant aujourd'hui ?
  const ou = new Map<string, { etab: string | null; classe: string | null }>();
  const chronologie = [...evenements].sort((a, b) => a.survenuLe.localeCompare(b.survenuLe));
  for (const e of chronologie) {
    if (e.type === "INSCRIPTION" || e.type === "REPRISE") ou.set(e.apprenantId, { etab: e.etablissementId, classe: e.classeId });
    else if (e.type === "TRANSFERT") ou.set(e.apprenantId, { etab: e.versEtablissementId, classe: e.versClasseId });
    else if (e.type === "ABANDON") ou.set(e.apprenantId, { etab: null, classe: null });
  }
  const presents = [...ou.entries()].filter(([, v]) => v.etab === etabId);
  const effectif = presents.length;
  const effParClasse = new Map<string, number>();
  for (const [, v] of presents) if (v.classe) effParClasse.set(v.classe, (effParClasse.get(v.classe) ?? 0) + 1);

  const absences = evenements.filter((e): e is Extract<Evenement, { type: "ABSENCE" }> =>
    e.type === "ABSENCE" && e.date === JOUR && e.etablissementId === etabId && ou.get(e.apprenantId)?.etab === etabId);
  const absents = new Map<string, Extract<Evenement, { type: "ABSENCE" }>>();
  for (const a of absences) absents.set(a.apprenantId, a);
  const absParClasse = new Map<string, number>();
  for (const a of absents.values()) absParClasse.set(a.classeId, (absParClasse.get(a.classeId) ?? 0) + 1);
  const dernier = [...absents.values()].map((a) => a.enregistreLe).sort().at(-1) ?? null;
  return { effectif, absents: absents.size, taux: effectif ? (absents.size / effectif) * 100 : null, effParClasse, absParClasse, dernier };
}

function EtablissementsPilotes({ communes }: { communes: Set<string> }) {
  const monde = useMonde();
  const live = useDemo((s) => s.evenementsLive);
  const pilotes = monde.etablissements.filter((e) => communes.has(e.communeId)).sort((a, b) => Number(b.id === ETAB_RONIERS) - Number(a.id === ETAB_RONIERS));
  const stats = useMemo(() => new Map(pilotes.map((p) => [p.id, statsPilote(monde.evenements, p.id)])), [monde.evenements]); // eslint-disable-line react-hooks/exhaustive-deps
  const saisiesSeance = live.filter((e) => e.type === "ABSENCE" && e.date === JOUR && pilotes.some((p) => p.id === e.etablissementId)).length;

  if (!pilotes.length) return null;
  const principal = pilotes[0]!;
  const s = stats.get(principal.id)!;
  const classes = monde.classes.filter((c) => c.etablissementId === principal.id);

  return (
    <Card>
      <CardHeader
        icon={Radio}
        title="Établissements pilotes · en direct"
        subtitle={`Calculé à l'instant depuis le registre d'événements · appel du ${dateLongue(DATE_SIMULEE)}`}
        action={<Badge ton={saisiesSeance ? "succes" : "neutre"} icone={saisiesSeance ? Radio : undefined}>{saisiesSeance} saisie{saisiesSeance > 1 ? "s" : ""} en séance</Badge>}
      />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,13rem)_1fr]">
        <div className="rounded-lg bg-surface-2/70 px-4 py-3.5">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Taux d'absence du jour</p>
          <p className="mt-0.5 text-[13px] font-semibold text-ink">{principal.nom}</p>
          <p aria-live="polite" className="mt-2 font-display text-[36px] font-bold leading-none text-ink tabular">
            {nombre(s.taux, 1)}<span className="ml-1 text-[16px] font-semibold text-ink-muted">%</span>
          </p>
          <p className="mt-2 text-[12px] text-ink-2 tabular">{entier(s.absents)} absent{s.absents > 1 ? "s" : ""} sur {entier(s.effectif)} inscrits</p>
          <p className="mt-1 text-[11.5px] text-ink-muted">{s.dernier ? `Dernière saisie à ${heure(s.dernier)}` : "Aucun appel enregistré aujourd'hui"}</p>
        </div>
        <div className="min-w-0">
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {classes.map((c) => {
              const abs = s.absParClasse.get(c.id) ?? 0;
              return (
                <li key={c.id} className={cn("rounded-md px-2.5 py-1.5 text-[12px]", abs ? "bg-warning-bg" : "bg-surface-2/70")}>
                  <span className="font-semibold text-ink">{c.libelle}</span>
                  <span className={cn("block tabular", abs ? "text-warning" : "text-ink-muted")}>{abs} abs. / {s.effParClasse.get(c.id) ?? 0}</span>
                </li>
              );
            })}
          </ul>
          {pilotes.slice(1).map((p) => {
            const sp = stats.get(p.id)!;
            return (
              <p key={p.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/60 px-3 py-2 text-[12.5px]">
                <span className="text-ink-2">{p.nom}</span>
                <span className="font-semibold text-ink tabular">{pourcent(sp.taux)} <span className="font-normal text-ink-muted">({sp.absents}/{sp.effectif})</span></span>
              </p>
            );
          })}
        </div>
      </div>
      <div className="mt-4 rounded-md border border-info/25 bg-info-bg/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <span className="font-semibold text-info">Un fait, quatre restitutions.</span> L'appel saisi par l'enseignant crée un événement « Absence » : il notifie le parent, s'inscrit chez la directrice, fait bouger ce taux et apparaît au cockpit national, sans ressaisie.
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ Inspecteur : établissements de la circonscription */

const PAGE = 15;

function TableauCirconscription({ etabs }: { etabs: EtablissementGenere[] }) {
  const [limite, setLimite] = useState(PAGE);
  const [relances, setRelances] = useState<Set<string>>(new Set());
  const lignes = useMemo(() => [...etabs].sort((a, b) => Number(a.transmis) - Number(b.transmis) || b.effectif / b.capacite - a.effectif / a.capacite), [etabs]);
  const retard = etabs.filter((e) => !e.transmis).length;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Établissements de la circonscription</h2>
          <p className="text-[12.5px] text-ink-muted">Retardataires en tête, puis par taux d'occupation décroissant.</p>
        </div>
        <Badge ton={retard ? "avertissement" : "succes"} icone={retard ? Clock : Check}>{retard} sur {etabs.length} n'ont pas transmis</Badge>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <caption className="sr-only">Établissements de la circonscription, avec occupation, enseignants, indice de performance et transmission</caption>
          <thead className="bg-surface-2 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Établissement</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Effectif</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Occupation</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Enseignants</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold" title="1,00 = niveau attendu compte tenu du contexte">Indice de perf.</th>
              <th scope="col" className="px-3 py-2 font-semibold">Transmission</th>
            </tr>
          </thead>
          <tbody>
            {lignes.slice(0, limite).map((e, i) => {
              const occ = (e.effectif / Math.max(1, e.capacite)) * 100;
              const relance = relances.has(e.id);
              return (
                <tr key={e.id} className={cn("animate-row border-t border-line/60", !e.transmis && "bg-warning-bg/40")} style={{ animationDelay: `${Math.min(i, 15) * 20}ms` }}>
                  <td className="min-w-[12rem] px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{e.nom}</span>
                      {e.id.includes("-PILOTE-") && <Badge ton="marque">Pilote</Badge>}
                    </span>
                    <span className="block text-[11.5px] text-ink-muted">{e.cycle === "primaire" ? "Primaire" : "Secondaire"} · {nomCommune(e.communeId)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular">{entier(e.effectif)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular", occ > 110 ? "font-semibold text-critical" : "text-ink")}>{pourcent(occ, 0)}{occ > 110 && <span className="sr-only"> (saturé)</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular">{entier(e.enseignants)}</td>
                  <td className={cn("px-3 py-2.5 text-right tabular", e.indicePerformance < 0.9 && "text-critical")}>{nombre(e.indicePerformance, 2)}</td>
                  <td className="px-3 py-2.5">
                    {e.transmis ? (
                      <Badge ton="succes" icone={Check}>Transmis</Badge>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge ton="avertissement" icone={Clock}>Non transmis</Badge>
                        <Button
                          taille="sm"
                          variante={relance ? "fantome" : "secondaire"}
                          icone={relance ? Check : BellRing}
                          disabled={relance}
                          onClick={() => setRelances((s) => new Set(s).add(e.id))}
                          aria-label={`Relancer ${e.nom}`}
                        >
                          {relance ? "Relance envoyée" : "Relancer"}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {lignes.length > PAGE && (
        <div className="border-t border-line/60 px-5 py-3">
          <button type="button" onClick={() => setLimite((l) => (l >= lignes.length ? PAGE : lignes.length))} className="text-[13px] font-medium text-blue hover:underline">
            {limite >= lignes.length ? "Réduire la liste" : `Afficher les ${lignes.length} établissements`}
          </button>
        </div>
      )}
      <p className="border-t border-line/60 px-5 py-3 text-[11.5px] text-ink-muted">Indice de performance : résultats rapportés au niveau attendu compte tenu du contexte (1,00 = attendu). Un établissement qui n'a pas transmis fait baisser l'indice de confiance de tous les chiffres du territoire.</p>
    </Card>
  );
}

/* ------------------------------------------------------------------ Direction départementale : retardataires */

function Retardataires({ etabs, total }: { etabs: EtablissementGenere[]; total: number }) {
  const [relancees, setRelancees] = useState<Set<string>>(new Set());
  const parCommune = [...etabs.reduce((m, e) => m.set(e.communeId, [...(m.get(e.communeId) ?? []), e]), new Map<string, EtablissementGenere[]>())]
    .sort((a, b) => b[1].length - a[1].length);
  return (
    <Card>
      <CardHeader
        icon={Clock}
        title="Établissements n'ayant pas transmis"
        subtitle={`${entier(etabs.length)} sur ${entier(total)} (${pourcent((etabs.length / Math.max(1, total)) * 100)}) · ils abaissent l'indice de confiance du département`}
      />
      {parCommune.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {parCommune.map(([id, liste]) => {
            const fait = relancees.has(id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 rounded-md bg-surface-2/70 px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{nomCommune(id)}</span>
                  <span className="text-[12px] text-warning">{liste.length} établissement{liste.length > 1 ? "s" : ""} en retard</span>
                </span>
                <Button taille="sm" variante={fait ? "fantome" : "secondaire"} icone={fait ? Check : BellRing} disabled={fait} onClick={() => setRelancees((s) => new Set(s).add(id))} aria-label={`Relancer les établissements de ${nomCommune(id)}`}>
                  {fait ? "Relancés" : "Relancer"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EtatVide icone={Check} titre="Tous les établissements ont transmis" />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Inspecteur : points d'attention */

function PointsAttention({ etabs }: { etabs: EtablissementGenere[] }) {
  const satures = etabs.filter((e) => e.effectif / e.capacite > 1.1).length;
  const sousPerf = etabs.filter((e) => e.indicePerformance < 0.9).length;
  const retard = etabs.filter((e) => !e.transmis).length;
  const sansEau = etabs.filter((e) => !e.infrastructures.eau).length;
  const items: { libelle: string; valeur: number; detail: string; grave: boolean }[] = [
    { libelle: "Saturés", valeur: satures, detail: "occupation au-delà de 110 %", grave: satures > etabs.length / 2 },
    { libelle: "Sous le niveau attendu", valeur: sousPerf, detail: "indice de performance < 0,90", grave: sousPerf > 0 },
    { libelle: "Sans transmission", valeur: retard, detail: "données du mois non reçues", grave: retard > 0 },
    { libelle: "Sans point d'eau", valeur: sansEau, detail: "infrastructure déclarée absente", grave: sansEau > etabs.length / 4 },
  ];
  return (
    <Card>
      <CardHeader icon={TriangleAlert} title="Points d'attention de la circonscription" subtitle={`Sur ${entier(etabs.length)} établissements · ${ANNEE_COURANTE}`} />
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {items.map((i) => (
          <li key={i.libelle} className={cn("rounded-md px-3 py-2.5", i.grave ? "bg-warning-bg" : "bg-surface-2/70")}>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">{i.libelle}</span>
            <span className={cn("mt-1 flex items-center gap-1.5 font-display text-[22px] font-bold tabular", i.grave ? "text-warning" : "text-ink")}>
              {i.grave && <TriangleAlert size={15} aria-hidden />}{entier(i.valeur)}
            </span>
            <span className="block text-[11.5px] leading-snug text-ink-muted">{i.detail}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
