"use client";

import { NOM_DIPLOME_ATTESTE } from "@beile/contracts";
import { Award, BadgeCheck, CalendarClock, ExternalLink, GraduationCap, Info, Landmark, QrCode, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { CartePreuve, cheminVerification } from "@/components/ui/Preuve";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { useExamens, type Examens, type SessionExamenEtab } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { nombre } from "@/lib/format";
import { useEtablissementCourant } from "@/lib/session";
import { ChampRecherche, dateCourte, Dialogue, EtatErreur, HorsPerimetre, normaliser, Statut } from "../_composants";

type FiltreExamen = "tous" | "CEP" | "BEPC" | "BAC";
const LIBELLE_EXAMEN = NOM_DIPLOME_ATTESTE;
const LIBELLE_STATUT: Record<SessionExamenEtab["statut"], string> = {
  ouverte: "Inscriptions ouvertes", composition: "Épreuves en cours", deliberation: "Délibération par l'autorité", publiee: "Résultats publiés",
};
const LIBELLE_DECISION = { admis: "Admis", non_admis: "Non admis", absent: "Absent", exclu: "Exclu" } as const;
const TON_DECISION = { admis: "succes", non_admis: "critique", absent: "neutre", exclu: "critique" } as const;

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <PageExamens id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function PageExamens({ id }: { id: string }) {
  const examens = useExamens(id);
  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Processus P8"
        titre="Examens nationaux"
        sousTitre="Vos candidats au CEP, au BEPC et au BAC, et les verdicts publiés par l'autorité d'examen. L'établissement ne délibère pas : il suit ses élèves et retrouve leurs diplômes vérifiables."
        actions={<Link href="/verifier" className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-ink ring-1 ring-inset ring-line transition-all hover:bg-surface-2 active:scale-[0.97]"><ScanLine size={16} aria-hidden /> Vérifier un diplôme</Link>}
      />
      {examens.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
          <Squelette className="h-96" />
        </>
      ) : examens.isError ? (
        <Card><EtatErreur erreur={examens.error} reessayer={() => examens.refetch()} /></Card>
      ) : (
        <Contenu x={examens.data} />
      )}
    </div>
  );
}

function Contenu({ x }: { x: Examens }) {
  const candidats = x.sessions.reduce((s, v) => s + v.candidats.length, 0);
  const publiees = x.sessions.filter((s) => s.statut === "publiee");
  const admis = publiees.flatMap((s) => s.candidats).filter((c) => c.decision === "admis").length;
  const notes = publiees.flatMap((s) => s.candidats).filter((c) => c.decision === "admis" || c.decision === "non_admis").length;
  return (
    <>
      <Cascade data-guide="examens-indicateurs" className="grid gap-3 sm:grid-cols-3">
        <Element><TuileIndicateur libelle="Candidats inscrits" icone={Users} valeur={<Compteur valeur={candidats} format={(v) => String(Math.round(v))} />} /></Element>
        <Element><TuileIndicateur libelle="Sessions publiées" icone={CalendarClock} valeur={<Compteur valeur={publiees.length} format={(v) => String(Math.round(v))} />} /></Element>
        <Element><TuileIndicateur libelle="Taux d'admission (sessions publiées)" icone={GraduationCap} valeur={notes ? `${nombre((admis / notes) * 100, 1)} %` : "—"} /></Element>
      </Cascade>
      <Sessions sessions={x.sessions} />
      <Certificats x={x} />
    </>
  );
}

/* ================================================================== Sessions : candidats et verdicts officiels */

function Sessions({ sessions }: { sessions: SessionExamenEtab[] }) {
  const [choix, setChoix] = useState<string | null>(sessions[0]?.sessionId ?? null);
  const [q, setQ] = useState("");
  const [nombreVisible, setNombreVisible] = useState(25);
  const s = sessions.find((x) => x.sessionId === choix) ?? sessions[0] ?? null;
  const filtres = useMemo(() => {
    const n = normaliser(q);
    return (s?.candidats ?? []).filter((c) => !n || normaliser(`${c.nom} ${c.numeroTable}`).includes(n));
  }, [s, q]);
  return (
    <Card data-guide="examens-sessions" className="min-w-0 overflow-hidden p-0">
      <div className="space-y-4 px-5 pt-5">
        <CardHeader className="mb-0" icon={Landmark} title="Sessions et verdicts officiels" subtitle="Numéro de table et centre dès l'inscription ; verdict et diplôme après publication par l'autorité" action={<Badge>{sessions.length}</Badge>} />
        {sessions.length > 1 && (
          <div className="-mx-1 overflow-x-auto px-1">
            <Segmente label="Session" valeur={s?.sessionId ?? ""} onChange={(v) => { setChoix(v); setNombreVisible(25); }} options={sessions.map((x) => ({ valeur: x.sessionId, libelle: `${x.examen} · ${x.session}` }))} />
          </div>
        )}
      </div>
      {!s ? (
        <EtatVide icone={Landmark} titre="Aucun candidat inscrit" texte="Quand l'autorité d'examen inscrit vos élèves à une session, leur numéro de table et leur centre apparaissent ici." />
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line/60 px-5 py-3 text-[13px] text-ink-2">
            <Statut ton={s.statut === "publiee" ? "succes" : "info"}>{LIBELLE_STATUT[s.statut]}</Statut>
            <span className="min-w-0">{s.autorite}</span>
            {s.publieeLe && <span className="text-ink-muted">publiée le {dateCourte(s.publieeLe)}</span>}
          </div>
          {s.statut !== "publiee" && (
            <p className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-info-bg px-3.5 py-2.5 text-[12.5px] text-info">
              <Info size={15} className="mt-0.5 shrink-0" aria-hidden /> Les verdicts appartiennent à l&apos;autorité d&apos;examen : ils apparaîtront ici à la publication officielle de la session.
            </p>
          )}
          <div className="border-t border-line/60 px-5 py-3">
            <ChampRecherche valeur={q} onChange={(v) => { setQ(v); setNombreVisible(25); }} placeholder="Nom ou numéro de table" label="Rechercher un candidat" />
          </div>
          <ul className="divide-y divide-line/60 border-t border-line/60">
            {filtres.slice(0, nombreVisible).map((c, i) => (
              <motion.li key={c.apprenantId} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3 hover:bg-surface-2/40">
                <span className="w-24 shrink-0 font-mono text-[12.5px] text-ink-2">{c.numeroTable}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{c.nom}</span>
                  <span className="block truncate text-xs text-ink-muted">{c.centre}{c.mention ? ` · ${c.mention}` : ""}{c.moyenne != null ? ` · ${nombre(c.moyenne, 2)}/20` : ""}</span>
                </span>
                {c.decision ? <Statut ton={TON_DECISION[c.decision]}>{LIBELLE_DECISION[c.decision]}</Statut> : <span className="text-xs text-ink-muted">En attente</span>}
                {c.certificatId && <Link href={`/verifier/${encodeURIComponent(c.certificatId)}`} className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[12.5px] font-medium text-blue hover:bg-blue-soft/50">Diplôme <ExternalLink size={12} aria-hidden /></Link>}
              </motion.li>
            ))}
          </ul>
          {filtres.length === 0 && <p className="border-t border-line/60 px-5 py-4 text-sm text-ink-muted">Aucun candidat ne correspond à cette recherche.</p>}
          {filtres.length > nombreVisible && (
            <div className="flex items-center justify-between gap-3 border-t border-line/60 px-5 py-3 text-xs text-ink-muted">
              <span>{nombreVisible} sur {filtres.length} candidats</span>
              <Button variante="secondaire" taille="sm" onClick={() => setNombreVisible((n) => n + 50)}>Afficher 50 de plus</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ================================================================== Diplômes délivrés aux élèves de l'établissement */

function Certificats({ x }: { x: Examens }) {
  const [filtre, setFiltre] = useState<FiltreExamen>("tous");
  const [q, setQ] = useState("");
  const [apercu, setApercu] = useState<string | null>(null);
  const presents = useMemo(() => new Set(x.diplomes.map((c) => c.examen)), [x.diplomes]);
  const liste = useMemo(() => {
    const n = normaliser(q);
    return x.diplomes.filter((c) => (filtre === "tous" || c.examen === filtre) && (!n || normaliser(`${c.titulaire} ${c.id}`).includes(n)));
  }, [x.diplomes, filtre, q]);
  const choisi = x.diplomes.find((c) => c.id === apercu) ?? null;
  const options = [{ valeur: "tous" as const, libelle: `Tous (${x.diplomes.length})` }, ...(["CEP", "BEPC", "BAC"] as const).filter((e) => presents.has(e)).map((e) => ({ valeur: e, libelle: e }))];

  return (
    <Card data-guide="examens-diplomes" className="min-w-0 overflow-hidden p-0">
      <div className="space-y-4 px-5 pt-5">
        <CardHeader className="mb-0" icon={Award} title="Diplômes de vos élèves" subtitle="Délivrés par l'autorité d'examen, rattachés à l'identifiant de chaque apprenant passé par l'établissement ; contrôlables sans compte" action={<Badge>{x.diplomes.length}</Badge>} />
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="-mx-1 overflow-x-auto px-1"><Segmente label="Examen" valeur={filtre} onChange={setFiltre} options={options} /></div>
          <ChampRecherche valeur={q} onChange={setQ} placeholder="Titulaire ou identifiant du diplôme" label="Rechercher un diplôme" />
        </div>
      </div>
      {liste.length === 0 ? (
        <EtatVide icone={Award} titre="Aucun diplôme" texte={x.diplomes.length ? "Aucun diplôme ne correspond à ces critères." : "Les diplômes (CEP, BEPC, BAC) de vos élèves apparaîtront ici après publication des résultats."} />
      ) : (
        <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
          {liste.slice(0, 60).map((c, i) => (
            <motion.li key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-surface-2/40">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", c.revoque ? "bg-critical-bg text-critical" : "bg-warning-bg text-warning")}><Award size={17} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{c.titulaire}</p>
                <p className="truncate text-xs text-ink-muted"><span title={LIBELLE_EXAMEN[c.examen]}>{c.examen}</span> {c.session}{c.mention ? ` · ${c.mention}` : ""}{c.moyenne != null && <> · <span className="tabular">{nombre(c.moyenne, 2)}/20</span></>} · délivré le {dateCourte(c.delivreLe)}</p>
              </div>
              {c.revoque && <Statut ton="critique">Révoqué</Statut>}
              <div className="ml-12 flex gap-1.5 sm:ml-0">
                <Button variante="fantome" taille="sm" icone={QrCode} onClick={() => setApercu(c.id)}>Attestation</Button>
                <Link href={cheminVerification(c)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-blue transition-all hover:bg-blue-soft/50 active:scale-[0.97]">Vérifier <ExternalLink size={12} aria-hidden /></Link>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      {liste.length > 60 && <p className="border-t border-line/60 px-5 py-3 text-xs text-ink-muted">60 premiers diplômes affichés sur {liste.length} : affinez la recherche.</p>}

      <Dialogue ouvert={!!choisi} onFermer={() => setApercu(null)} icone={BadgeCheck} ton="succes" titre="Attestation numérique" description="Le QR code renvoie à la page publique de vérification : identifiant et empreinte du diplôme." large>
        {choisi && <CartePreuve certificat={choisi} titulaire={choisi.titulaire} />}
      </Dialogue>
    </Card>
  );
}
