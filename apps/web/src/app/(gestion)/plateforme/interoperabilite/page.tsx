"use client";

import type { SourceDonnee } from "@beile/contracts";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BadgeCheck, Check, CheckCircle2, CircleX, FileJson, Fingerprint, Landmark, Link2, Network, PlayCircle, RefreshCw, ScrollText, Server, ShieldCheck, ShieldX, Workflow } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { AnimatePresence, Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { isoDepuisPg, useInteroperabilite, type Interoperabilite } from "@/lib/api/gouvernance";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

/* ------------------------------------------------------------------ Raccordements (catalogue des contrats d'interface) */

const TZ = "Africa/Porto-Novo";
const dateHeure = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const ETAPES = ["Cadrage", "Contrat", "Test", "Mise en service", "Exploitation"] as const;

interface Raccordement {
  id: string;
  nom: string;
  via: string;
  sens: "entrant" | "sortant" | "bidirectionnel";
  donnees: string;
  producteurDe: string;
  contrat: string;
  frequence: string;
  statut: "actif" | "recette";
  etape: number;
  icone: typeof Fingerprint;
  /** Source correspondante dans le registre des événements, quand le raccordement y inscrit des faits. */
  source?: SourceDonnee;
}

const RACCORDEMENTS: Raccordement[] = [
  {
    id: "anip", nom: "Registre national des personnes", via: "ANIP, via la plateforme nationale d'interopérabilité", sens: "entrant",
    donnees: "Numéro personnel d'identification (NPI), nom, prénoms, date et lieu de naissance, filiation",
    producteurDe: "Identité civile et filiation", contrat: "identite.personne v1.2", frequence: "À la demande (inscription, vérification d'un lien parental)",
    statut: "actif", etape: 4, icone: Fingerprint,
  },
  {
    id: "educmaster", nom: "EducMaster", via: "Échange de fichiers sécurisé, puis API", sens: "bidirectionnel",
    donnees: "Historique scolaire antérieur, décisions de passage, établissements déjà équipés",
    producteurDe: "Historique antérieur à BEILE", contrat: "scolarite.historique v2.0", frequence: "Quotidienne (lot de 02:00)",
    statut: "actif", etape: 4, icone: Server, source: "educmaster",
  },
  {
    id: "examens", nom: "Système d'examens", via: "Direction des examens et concours, API", sens: "bidirectionnel",
    donnees: "Candidatures (sortant, sans ressaisie) ; résultats et certifications (entrant)",
    producteurDe: "Résultats d'examens et diplômes", contrat: "examens.resultat v1.1", frequence: "Par session (candidatures, délibérations)",
    statut: "actif", etape: 4, icone: ScrollText, source: "examens",
  },
  {
    id: "portail", nom: "Portail national des services publics", via: "service-public.bj, API", sens: "sortant",
    donnees: "Attestations de scolarité et vérification de diplômes à la demande de l'usager",
    producteurDe: "Aucune donnée : consommateur uniquement", contrat: "attestation.scolarite v0.9", frequence: "À la demande de l'usager",
    statut: "recette", etape: 2, icone: Landmark,
  },
];

const SENS = {
  entrant: { libelle: "Entrant vers BEILE", icone: ArrowDownLeft },
  sortant: { libelle: "Sortant de BEILE", icone: ArrowUpRight },
  bidirectionnel: { libelle: "Dans les deux sens", icone: ArrowLeftRight },
} as const;

const SOURCE_LIBELLE: Record<SourceDonnee, { nom: string; role: string }> = {
  beile: { nom: "BEILE", role: "Vie scolaire saisie dans les établissements : inscriptions, notes, absences, transferts" },
  educmaster: { nom: "EducMaster", role: "Historique antérieur : décisions de passage reprises sans ressaisie" },
  examens: { nom: "Système d'examens", role: "Résultats et certifications, seul producteur officiel" },
  registre_national: { nom: "Registre national des personnes", role: "Identité : consultée à la demande, jamais recopiée comme événement éducatif" },
};

/* ------------------------------------------------------------------ Validation de schéma (zod, exécutée dans le navigateur) */

const SchemaPersonne = z.object({
  npi: z.string().regex(/^\d{10}$/, "10 chiffres attendus"),
  nom: z.string().min(1),
  prenoms: z.string().min(1),
  dateNaissance: z.iso.date("date ISO 8601 attendue (AAAA-MM-JJ)"),
  sexe: z.enum(["F", "M"]),
});
const EXEMPLES = {
  conforme: { npi: "2014031200", nom: "HOUNKPATIN", prenoms: "Aïcha Mariam", dateNaissance: "2014-03-12", sexe: "F" },
  non_conforme: { npi: "2014031200", nom: "HOUNKPATIN", prenoms: "Aïcha Mariam", dateNaissance: "12/03/2014", sexe: "F" },
} as const;
type CleExemple = keyof typeof EXEMPLES;

/* ------------------------------------------------------------------ Page */

export default function InteroperabilitePage() {
  const interop = useInteroperabilite();

  if (interop.isError && interop.error instanceof ErreurApi && interop.error.refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Données · P12" titre="Interopérabilité" />
          <Card><EtatVide icone={ShieldX} titre="Réservé à l'exploitation de la plateforme" texte="Le refus a été inscrit au journal d'audit." /></Card>
        </div>
      </EntreePage>
    );
  }

  const d = interop.data;
  const jour = d?.sources.reduce((s, x) => s + x.jour, 0) ?? 0;
  const total = d?.sources.reduce((s, x) => s + x.total, 0) ?? 0;
  const liaison = d && d.registreNational.apprenants ? (d.registreNational.lies / d.registreNational.apprenants) * 100 : null;

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre="Données · P12"
          titre="Interopérabilité"
          sousTitre="Les systèmes nationaux avec lesquels BEILE échange, selon des contrats d'interface versionnés. Chaque message est validé contre son schéma avant d'entrer : un message non conforme est rejeté, jamais corrigé en silence."
          actions={<Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={interop.isFetching && !interop.isPending} onClick={() => interop.refetch()}>Actualiser</Button>}
        />

        {interop.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
        ) : interop.isError ? (
          <Card><EtatVide icone={RefreshCw} titre="Mesures indisponibles" texte={interop.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => interop.refetch()}>Réessayer</Button>} /></Card>
        ) : (
          <Cascade data-guide="interop-indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Element><TuileIndicateur libelle="Raccordements" icone={Network} accent="bleu" valeur={entier(RACCORDEMENTS.length)} indice={`${RACCORDEMENTS.filter((r) => r.statut === "actif").length} en exploitation · ${RACCORDEMENTS.filter((r) => r.statut === "recette").length} en recette`} /></Element>
            <Element><TuileIndicateur libelle="Événements reçus aujourd'hui" icone={Workflow} accent="sarcelle" valeur={<Compteur valeur={jour} format={entier} />} indice="toutes sources confondues" /></Element>
            <Element><TuileIndicateur libelle="Événements au registre" icone={ScrollText} accent="neutre" valeur={<Compteur valeur={total} format={entier} />} indice="provenance tracée pour chacun" /></Element>
            <Element><TuileIndicateur libelle="Apprenants liés au NPI" icone={Link2} accent="bleu" valeur={liaison != null ? <Compteur valeur={liaison} format={(v) => nombre(v, 1)} /> : "—"} unite="%" indice={`${entier(d!.registreNational.lies)} sur ${entier(d!.registreNational.apprenants)} apprenants`} /></Element>
          </Cascade>
        )}

        <Card className="border-blue/25 bg-blue-soft/50">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink shadow-soft"><ShieldCheck size={19} aria-hidden /></span>
            <div className="min-w-0">
              <p className="font-display text-[16px] font-bold text-ink">Un système producteur unique pour chaque donnée</p>
              <p className="mt-1.5 max-w-3xl text-sm text-ink-2">
                L'identité civile appartient au registre national (ANIP) : BEILE la consulte, ne la crée ni ne la modifie. Les résultats d'examens appartiennent
                au système d'examens. BEILE produit les faits de la vie scolaire. Quand deux systèmes divergent, c'est le producteur qui fait foi, et l'écart est signalé, pas arbitré localement.
              </p>
            </div>
          </div>
        </Card>

        <section aria-labelledby="titre-raccordements" className="space-y-4">
          <h2 id="titre-raccordements" className="text-[18px] font-bold text-ink">Raccordements</h2>
          <Cascade data-guide="interop-raccordements" className="grid gap-4 lg:grid-cols-2">
            {RACCORDEMENTS.map((r) => <Element key={r.id}><CarteRaccordement r={r} d={d} /></Element>)}
          </Cascade>
          <p className="text-xs text-ink-muted">Séquence de raccordement : cadrage → contrat d'interface → tests → mise en service → exploitation. Volumes et dates lus dans le registre des événements.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="min-w-0 lg:col-span-3">
            <CardHeader icon={ScrollText} title="Provenance des événements du registre" subtitle="Chaque événement porte sa source ; comptage exact en base." />
            {d ? <Provenance d={d} /> : <div className="space-y-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-12 w-full" />)}</div>}
          </Card>
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <ValidationSchema />
          </div>
        </div>

        <Card className="min-w-0">
          <CardHeader icon={BadgeCheck} title="Vérifications publiques de diplômes · 30 jours" subtitle="Service ouvert sans compte (QR code) : chaque vérification est inscrite au journal, sans donnée sur le demandeur." />
          {d ? <Verifications points={d.verificationsDiplomes} reference={interop.dataUpdatedAt} /> : <Squelette className="h-32 w-full" />}
        </Card>
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Carte d'un raccordement */

function CarteRaccordement({ r, d }: { r: Raccordement; d?: Interoperabilite }) {
  const Sens = SENS[r.sens];
  const Icone = r.icone;
  const src = r.source ? d?.sources.find((s) => s.source === r.source) : undefined;
  const derniere = src ? isoDepuisPg(src.derniere) : null;
  const mesures: [string, React.ReactNode][] = !d
    ? [["Chargement", "…"]]
    : r.id === "anip"
      ? [["Personnes référencées", entier(d.registreNational.personnes)], ["Apprenants liés", entier(d.registreNational.lies)], ["Recopies", "Aucune"]]
      : r.statut === "recette"
        ? [["Environnement", "Recette"], ["Échanges en production", "Aucun"], ["Mise en service", "Après tests"]]
        : [["Dernière réception", derniere ? dateHeure(derniere) : "—"], ["Aujourd'hui", entier(src?.jour ?? 0)], ["Total reçu", entier(src?.total ?? 0)]];
  return (
    <article className="flex h-full min-w-0 flex-col rounded-xl border border-line/70 bg-surface p-5 shadow-float">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><Icone size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-semibold text-ink">{r.nom}</h3>
          <p className="text-[12.5px] text-ink-muted">{r.via}</p>
        </div>
        {r.statut === "actif"
          ? <Badge ton="succes"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />Actif</Badge>
          : <Badge ton="info"><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />En recette</Badge>}
      </header>

      <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={`Séquence de raccordement : étape ${r.etape + 1} sur 5, ${ETAPES[r.etape]}`}>
        {ETAPES.map((e, i) => (
          <li key={e} className="min-w-0">
            <span className="block h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <motion.span className={cn("block h-full rounded-full", i < r.etape ? "bg-teal" : "bg-blue")} initial={{ width: 0 }} whileInView={{ width: i <= r.etape ? "100%" : "0%" }} viewport={{ once: true }} transition={{ duration: 0.4, ease: EASE, delay: i * 0.12 }} />
            </span>
            <span className={cn("mt-1 flex items-center gap-0.5 truncate text-[10.5px]", i === r.etape ? "font-semibold text-ink" : "text-ink-muted")}>
              {i < r.etape && <Check size={10} aria-hidden className="shrink-0" />}
              <span className="truncate">{e}</span>
            </span>
          </li>
        ))}
      </ol>

      <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-2.5 text-[13px] sm:grid-cols-2">
        <div className="min-w-0"><dt className="text-[11.5px] text-ink-muted">Sens du flux</dt><dd className="mt-0.5 flex items-center gap-1.5 text-ink"><Sens.icone size={14} aria-hidden className="text-ink-muted" />{Sens.libelle}</dd></div>
        <div className="min-w-0"><dt className="text-[11.5px] text-ink-muted">Contrat d'interface</dt><dd className="mt-0.5 font-mono text-[12px] text-ink">{r.contrat}</dd></div>
        <div className="min-w-0 sm:col-span-2"><dt className="text-[11.5px] text-ink-muted">Données échangées</dt><dd className="mt-0.5 text-ink">{r.donnees}</dd></div>
        <div className="min-w-0"><dt className="text-[11.5px] text-ink-muted">Producteur de référence pour</dt><dd className="mt-0.5 text-ink">{r.producteurDe}</dd></div>
        <div className="min-w-0"><dt className="text-[11.5px] text-ink-muted">Fréquence</dt><dd className="mt-0.5 text-ink">{r.frequence}</dd></div>
      </dl>

      <div className="mt-auto pt-4">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2/60 p-3">
          {mesures.map(([l, v]) => (
            <div key={l} className="min-w-0"><Etiquette className="block truncate">{l}</Etiquette><p className="mt-1 truncate text-sm font-semibold tabular text-ink">{v}</p></div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ Provenance réelle */

function Provenance({ d }: { d: Interoperabilite }) {
  const total = d.sources.reduce((s, x) => s + x.total, 0) || 1;
  const lignes = [...d.sources].sort((a, b) => b.total - a.total);
  return (
    <>
      <ul className="space-y-4">
        {lignes.map((p, i) => {
          const part = (p.total / total) * 100;
          const derniere = isoDepuisPg(p.derniere);
          return (
            <li key={p.source}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{SOURCE_LIBELLE[p.source]?.nom ?? p.source} <span className="font-mono text-[11px] font-normal text-ink-muted">{p.source}</span></span>
                <span className="shrink-0 text-sm font-semibold tabular text-ink">{entier(p.total)} <span className="text-xs font-normal text-ink-muted">· {pourcent(part)}</span></span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <motion.div className="h-full rounded-full bg-[var(--series-1)]" initial={{ width: 0 }} animate={{ width: `${Math.max(p.total ? 1 : 0, part)}%` }} transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">{SOURCE_LIBELLE[p.source]?.role}{derniere ? ` · dernier événement le ${dateHeure(derniere)}` : ""}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Types d'événements reçus">
                {p.types.map((t) => <li key={t}><Badge ton="neutre" className="font-mono text-[10.5px]">{t}</Badge></li>)}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 rounded-md bg-surface-2/60 px-3 py-2 text-xs text-ink-2">
        {entier(d.registreNational.personnes)} personnes du registre national sont consultables par leur NPI ; aucune n'est recopiée comme événement éducatif : c'est l'application du producteur unique.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ Validation de schéma */

function ValidationSchema() {
  const [exemple, setExemple] = useState<CleExemple>("non_conforme");
  const [resultat, setResultat] = useState<{ cle: CleExemple; ok: boolean; issues: { chemin: string; message: string }[] } | null>(null);
  const valider = () => {
    const r = SchemaPersonne.safeParse(EXEMPLES[exemple]);
    setResultat({ cle: exemple, ok: r.success, issues: r.success ? [] : r.error.issues.map((i) => ({ chemin: i.path.join(".") || "(racine)", message: i.message })) });
  };
  return (
    <Card data-guide="interop-validation" className="min-w-0">
      <CardHeader icon={FileJson} title="Rejouer une validation" subtitle="Validation exécutée dans votre navigateur contre le schéma identite.personne v1.2." />
      <Segmente label="Message à valider" options={[{ valeur: "non_conforme", libelle: "Message reçu" }, { valeur: "conforme", libelle: "Message corrigé" }]} valeur={exemple} onChange={(v) => { setExemple(v); setResultat(null); }} />
      <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink">{JSON.stringify(EXEMPLES[exemple], null, 2)}</pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button icone={PlayCircle} onClick={valider}>Valider le message</Button>
        <span className="text-xs text-ink-muted">Exemple de message, sans donnée réelle.</span>
      </div>
      <AnimatePresence mode="wait">
        {resultat && resultat.cle === exemple && (
          <motion.div key={`${resultat.cle}-${resultat.ok}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }} role="status" className={cn("mt-3 rounded-md border p-3 text-[13px]", resultat.ok ? "border-success/30 bg-success-bg" : "border-critical/30 bg-critical-bg")}>
            <p className={cn("flex items-center gap-2 font-semibold", resultat.ok ? "text-success" : "text-critical")}>
              {resultat.ok ? <CheckCircle2 size={16} aria-hidden /> : <CircleX size={16} aria-hidden />}
              {resultat.ok ? "ACCEPTÉ : conforme au contrat" : `REJETÉ : ${resultat.issues.length} erreur${resultat.issues.length > 1 ? "s" : ""} de schéma`}
            </p>
            {!resultat.ok && (
              <ul className="mt-2 space-y-1">
                {resultat.issues.map((i) => <li key={i.chemin} className="text-ink"><span className="font-mono text-[12px]">{i.chemin}</span> : {i.message}</li>)}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

/* ------------------------------------------------------------------ Vérifications de diplômes (30 barres) */

function Verifications({ points, reference }: { points: Interoperabilite["verificationsDiplomes"]; reference: number }) {
  const parJour = new Map(points.map((p) => [p.jour, p.n]));
  const fin = reference || Date.parse(points[points.length - 1]?.jour ?? "1970-01-01");
  const jours = Array.from({ length: 30 }, (_, k) => {
    const cle = new Date(fin - (29 - k) * 86_400_000).toISOString().slice(0, 10);
    return { cle, n: parJour.get(cle) ?? 0 };
  });
  const max = Math.max(1, ...jours.map((j) => j.n));
  const total = jours.reduce((s, j) => s + j.n, 0);
  const libelle = (cle: string) => new Date(`${cle}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", timeZone: TZ });
  if (!total) return <EtatVide icone={BadgeCheck} titre="Aucune vérification sur 30 jours" texte="Les vérifications faites depuis la page publique « Vérifier un diplôme » apparaîtront ici." />;
  return (
    <div>
      <p className="mb-3 text-xs text-ink-muted"><span className="font-semibold tabular text-ink">{entier(total)}</span> vérification{total > 1 ? "s" : ""} sur 30 jours</p>
      <div className="flex h-32 items-end gap-[3px]" role="img" aria-label={`Vérifications par jour : ${jours.filter((j) => j.n).map((j) => `${libelle(j.cle)} : ${j.n}`).join(" ; ")}`}>
        {jours.map((j, i) => (
          <div key={j.cle} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${libelle(j.cle)} · ${entier(j.n)} vérification(s)`}>
            <motion.div className="w-full rounded-t-[3px] bg-[var(--series-2)]" style={{ originY: 1, height: `${j.n ? Math.max(3, (j.n / max) * 100) : 0}%` }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6, ease: EASE, delay: i * 0.015 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 h-px bg-line" aria-hidden />
      <div className="mt-1.5 flex justify-between text-[11px] tabular text-ink-muted">
        <span>{libelle(jours[0]!.cle)}</span><span>{libelle(jours[14]!.cle)}</span><span>{libelle(jours[29]!.cle)}</span>
      </div>
    </div>
  );
}
