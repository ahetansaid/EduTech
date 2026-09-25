"use client";

import { Activity, CheckCircle2, Cpu, Database, GitBranch, KeyRound, Lock, RefreshCw, ScrollText, Server, ShieldAlert, ShieldX, Timer, TriangleAlert, Users, Wifi, WifiOff, XCircle } from "lucide-react";
import { Cascade, Compteur, EASE, Element, EntreePage, motion } from "@/components/motion";
import { useEnLigne } from "@/components/shell/EtatReseau";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Squelette } from "@/components/ui/primitives";
import { useEtatService, type EtatService } from "@/lib/api/gouvernance";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";

/* ------------------------------------------------------------------ Seuils et formats */

const TZ = "Africa/Porto-Novo";
const heureSec = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });
/** Latence d'un aller-retour à la base, mesurée par le serveur : au-delà, le service est considéré ralenti. */
const SEUIL_LATENCE_MS = 300;

function duree(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const j = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (j) return `${j} j ${h} h`;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min`;
  return `${s} s`;
}

const CRITICITE = [
  { niveau: 4, libelle: "Hautement sensible", exemples: "Identité, certifications, registre des événements", rpo: "Quelques minutes", rto: "Moins d'1 h" },
  { niveau: 3, libelle: "Personnel", exemples: "Dossiers apprenants, évaluations", rpo: "Moins de 15 min", rto: "Moins de 4 h" },
  { niveau: 2, libelle: "Professionnel", exemples: "Référentiels, affectations", rpo: "Moins d'1 h", rto: "Moins de 8 h" },
  { niveau: 1, libelle: "Public", exemples: "Statistiques agrégées publiées", rpo: "Moins de 24 h", rto: "Moins de 24 h" },
];

const CHAINE = [
  { branche: "dev", nom: "Intégration", role: "Fusion quotidienne des fonctionnalités, intégration continue obligatoire" },
  { branche: "staging", nom: "Recette", role: "Version candidate figée, validée avant toute mise en production" },
  { branche: "main", nom: "Production", role: "Seule branche déployée auprès des usagers" },
];

/* ------------------------------------------------------------------ Page */

export default function EtatPage() {
  const etat = useEtatService();
  const enLigne = useEnLigne();

  if (etat.isError && etat.error instanceof ErreurApi && etat.error.refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Conformité · P15" titre="État du service" />
          <Card><EtatVide icone={ShieldX} titre="Réservé à l'exploitation de la plateforme" texte="Votre rôle ne donne pas accès aux mesures d'exploitation. Le refus a été inscrit au journal d'audit." /></Card>
        </div>
      </EntreePage>
    );
  }

  const d = etat.data;
  const injoignable = etat.isError && !d;
  const ralenti = !!d && d.base.latenceMs > SEUIL_LATENCE_MS;

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre="Conformité · P15"
          titre="État du service"
          sousTitre="Le service fonctionne-t-il, répond-il vite, qui s'y connecte et combien d'accès sont refusés ? Chaque valeur est mesurée par le serveur au moment de la consultation."
          actions={
            <>
              <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line/70 bg-surface px-3 text-xs text-ink-2" title="Mesures relues toutes les 30 secondes">
                <span className="relative flex h-2 w-2" aria-hidden>
                  <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60", injoignable ? "bg-critical" : "bg-success", etat.isFetching && "animate-ping")} />
                  <span className={cn("relative inline-flex h-2 w-2 rounded-full", injoignable ? "bg-critical" : "bg-success")} />
                </span>
                Mesuré à {d ? heureSec(d.horodatage) : "…"}
              </span>
              <Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={etat.isFetching && !etat.isPending} onClick={() => etat.refetch()}>Mesurer</Button>
            </>
          }
        />

        {etat.isPending ? (
          <Squelette className="h-[88px] w-full rounded-xl" />
        ) : (
          <motion.div
            key={injoignable ? "ko" : ralenti ? "lent" : "ok"}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}
            role="status"
            className={cn("flex flex-col gap-4 rounded-xl border p-4 shadow-float sm:flex-row sm:items-center sm:p-5", injoignable ? "border-critical/30 bg-critical-bg" : ralenti ? "border-warning/30 bg-warning-bg" : "border-success/30 bg-success-bg")}
          >
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface shadow-soft", injoignable ? "text-critical" : ralenti ? "text-warning" : "text-success")}>
              {injoignable ? <XCircle size={21} aria-hidden /> : ralenti ? <TriangleAlert size={21} aria-hidden /> : <CheckCircle2 size={21} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[18px] font-bold text-ink">
                {injoignable ? "Le service ne répond pas" : ralenti ? "Le service fonctionne, avec un ralentissement" : "Tous les services fonctionnent normalement"}
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                {injoignable
                  ? `${etat.error?.message ?? "Aucune réponse"}. Les saisies faites hors connexion restent conservées sur l'appareil.`
                  : `API et base de données joignables. Aller-retour à la base : ${nombre(d!.base.latenceMs, 1)} ms (seuil d'alerte : ${SEUIL_LATENCE_MS} ms).`}
              </p>
            </div>
            {injoignable && <Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => etat.refetch()}>Réessayer</Button>}
          </motion.div>
        )}

        {d ? <Mesures d={d} /> : etat.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader icon={Activity} title="Activité du registre · 24 heures" subtitle="Événements éducatifs inscrits par heure (inscriptions, absences, évaluations…), lus dans le registre en ajout seul." />
            {d ? <ActiviteHoraire points={d.activite24h} reference={d.horodatage} /> : etat.isPending ? <Squelette className="h-44 w-full" /> : <EtatVide icone={Activity} titre="Mesure indisponible" />}
          </Card>

          <Card className="min-w-0">
            <CardHeader icon={Server} title="Instance" subtitle="Processus qui a servi cette mesure" />
            {d ? (
              <dl className="divide-y divide-line/60 text-sm">
                {([
                  ["Version de l'API", <span key="v" className="font-mono">{d.service.version}</span>],
                  ["En service depuis", duree(Date.parse(d.horodatage) - Date.parse(d.service.instanceDepuis))],
                  ["Région", <span key="r" className="font-mono">{d.service.region}</span>],
                  ["Mémoire", `${entier(d.service.memoireMo)} Mo`],
                  ["PostgreSQL", d.base.postgres ?? "—"],
                  ["Taille de la base", d.base.taille ?? "—"],
                ] as [string, React.ReactNode][]).map(([l, v]) => (
                  <div key={l} className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="text-ink-muted">{l}</dt>
                    <dd className="text-right font-medium tabular text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Squelette key={i} className="h-8 w-full" />)}</div>}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader icon={ShieldAlert} title="Sécurité · 24 heures" subtitle="Lu dans le journal d'audit : chaque décision d'accès et chaque connexion y est inscrite." />
            {d ? <Securite d={d} /> : <Squelette className="h-32 w-full" />}
          </Card>
          <Card className="min-w-0">
            <CardHeader icon={enLigne ? Wifi : WifiOff} title="Votre poste" subtitle="Connexion de cet appareil au service" action={enLigne ? <Badge ton="succes" icone={Wifi}>En ligne</Badge> : <Badge ton="avertissement" icone={WifiOff}>Hors connexion</Badge>} />
            <p className="text-sm text-ink-2">
              {enLigne
                ? "Les saisies partent immédiatement. En cas de coupure, elles sont conservées sur l'appareil puis envoyées au retour du réseau, avec leur date réelle."
                : "Les saisies faites maintenant sont conservées sur l'appareil et seront envoyées automatiquement au retour du réseau."}
            </p>
          </Card>
        </div>

        <Card className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-line/60 px-5 py-4">
            <h2 className="text-[15px] font-semibold text-ink">Objectifs de continuité par niveau de criticité</h2>
            <p className="text-xs text-ink-muted">
              <strong className="font-semibold text-ink-2">Perte maximale</strong> (RPO) : au pire, combien de minutes de saisie seraient à refaire.{" "}
              <strong className="font-semibold text-ink-2">Délai de reprise</strong> (RTO) : en combien de temps le service revient. Cibles d'engagement, alignées sur le registre des traitements.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Niveau</th>
                  <th scope="col" className="hidden px-5 py-2.5 font-semibold sm:table-cell">Exemples</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Perte max.</th>
                  <th scope="col" className="px-5 py-2.5 font-semibold">Reprise</th>
                </tr>
              </thead>
              <tbody>
                {CRITICITE.map((c) => (
                  <tr key={c.niveau} className="border-t border-line/60">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-navy font-display text-[12px] font-bold text-white dark:bg-blue dark:text-navy-deep">{c.niveau}</span>
                        <span className="font-medium text-ink">{c.libelle}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-muted sm:hidden">{c.exemples}</span>
                    </td>
                    <td className="hidden px-5 py-3 text-ink-2 sm:table-cell">{c.exemples}</td>
                    <td className="px-5 py-3 text-ink">{c.rpo}</td>
                    <td className="px-5 py-3 text-ink">{c.rto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader icon={GitBranch} title="Chaîne de livraison" subtitle="Une modification passe par l'intégration, puis la recette, avant la production. Jamais directement." />
          <Cascade className="grid gap-3 md:grid-cols-3">
            {CHAINE.map((e, i) => (
              <Element key={e.branche}>
                <div className="relative h-full rounded-lg border border-line/70 bg-surface-2/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold text-ink">{e.branche}</span>
                    <span className="text-xs text-ink-muted">Étape {i + 1}/3</span>
                  </div>
                  <p className="mt-2 font-display text-[16px] font-bold text-ink">{e.nom}</p>
                  <p className="text-[12.5px] text-ink-2">{e.role}</p>
                </div>
              </Element>
            ))}
          </Cascade>
          <p className="mt-3 text-xs text-ink-muted">Chaque passage exige une intégration continue verte : vérification des types, tests du moteur d'accès et du calcul des indicateurs, audit des dépendances.</p>
        </Card>
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Tuiles de mesure */

function Mesures({ d }: { d: EtatService }) {
  return (
    <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Element>
        <TuileIndicateur libelle="Latence de la base" icone={Timer} accent={d.base.latenceMs > SEUIL_LATENCE_MS ? "ambre" : "sarcelle"} valeur={<Compteur valeur={d.base.latenceMs} format={(v) => nombre(v, 1)} duree={0.6} />} unite="ms" indice="aller-retour mesuré à l'instant" />
      </Element>
      <Element>
        <TuileIndicateur libelle="Registre des événements" icone={Database} accent="bleu" valeur={<Compteur valeur={d.registre.total} format={entier} />} indice={`+${entier(d.registre.jour)} aujourd'hui · +${entier(d.registre.heure)} cette heure`} />
      </Element>
      <Element>
        <TuileIndicateur libelle="Sessions ouvertes" icone={Users} accent="bleu" valeur={<Compteur valeur={d.comptes.sessions} format={entier} />} indice={`${entier(d.comptes.actifs)} comptes actifs sur ${entier(d.comptes.comptes)}`} />
      </Element>
      <Element>
        <TuileIndicateur libelle="Accès refusés · 24 h" icone={ShieldX} accent="critique" valeur={<Compteur valeur={d.securite24h.refus} format={entier} />} indice={`sur ${entier(d.securite24h.consultations)} décisions journalisées`} />
      </Element>
    </Cascade>
  );
}

function Securite({ d }: { d: EtatService }) {
  const s = d.securite24h;
  const items = [
    { libelle: "Décisions journalisées", valeur: s.consultations, icone: ScrollText, ton: "text-accent-ink bg-blue-soft" },
    { libelle: "Accès refusés", valeur: s.refus, icone: ShieldX, ton: "text-critical bg-critical-bg" },
    { libelle: "Connexions réussies", valeur: s.connexions, icone: KeyRound, ton: "text-success bg-success-bg" },
    { libelle: "Échecs de connexion", valeur: s.echecs, icone: XCircle, ton: "text-warning bg-warning-bg" },
    { libelle: "Comptes verrouillés", valeur: d.comptes.verrouilles, icone: Lock, ton: d.comptes.verrouilles ? "text-critical bg-critical-bg" : "text-ink-muted bg-surface-2" },
    { libelle: "Part de refus", valeur: null, icone: Cpu, ton: "text-ink-2 bg-surface-2" },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <li key={it.libelle} className="flex min-w-0 items-center gap-3 rounded-lg bg-surface-2/50 p-3">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", it.ton)}><it.icone size={16} aria-hidden /></span>
          <span className="min-w-0">
            <Etiquette className="block truncate">{it.libelle}</Etiquette>
            <span className="block font-display text-[20px] font-bold leading-tight tabular text-ink">
              {it.valeur == null ? `${nombre(s.consultations ? (s.refus / s.consultations) * 100 : 0, 2)} %` : <Compteur valeur={it.valeur} format={entier} />}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Activité horaire */

function ActiviteHoraire({ points, reference }: { points: EtatService["activite24h"]; reference: string }) {
  const parHeure = new Map(points.map((p) => [p.heure, p.n]));
  const fin = Date.parse(reference);
  const heures = Array.from({ length: 24 }, (_, k) => {
    const cle = new Date(fin - (23 - k) * 3600_000).toISOString().slice(0, 13) + ":00";
    return { cle, n: parHeure.get(cle) ?? 0 };
  });
  const max = Math.max(1, ...heures.map((h) => h.n));
  const total = heures.reduce((s, h) => s + h.n, 0);
  const libelle = (cle: string) => new Date(`${cle}:00Z`).toLocaleTimeString("fr-FR", { hour: "2-digit", timeZone: TZ }).replace(/\s?h$/, "") + " h";
  return (
    <div>
      <p className="mb-3 text-xs text-ink-muted"><span className="font-semibold text-ink tabular">{entier(total)}</span> événement{total > 1 ? "s" : ""} sur 24 h · pic : {entier(max === 1 && total === 0 ? 0 : max)} par heure</p>
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Événements par heure : ${heures.map((h) => `${libelle(h.cle)} : ${h.n}`).join(" ; ")}`}>
        {heures.map((h, i) => (
          <div key={h.cle} className="group flex h-full min-w-0 flex-1 flex-col justify-end" title={`${libelle(h.cle)} · ${entier(h.n)} événement(s)`}>
            <motion.div
              className="w-full rounded-t-[3px] bg-[var(--series-1)] transition-[height] duration-500 group-hover:opacity-80"
              style={{ originY: 1, height: `${h.n ? Math.max(2, (h.n / max) * 100) : 0}%` }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.02 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 h-px bg-line" aria-hidden />
      <div className="mt-1.5 flex justify-between text-[11px] tabular text-ink-muted">
        {[0, 6, 12, 18, 23].map((k) => <span key={k}>{libelle(heures[k]!.cle)}</span>)}
      </div>
    </div>
  );
}
