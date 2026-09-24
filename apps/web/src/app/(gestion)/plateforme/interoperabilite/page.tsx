"use client";

import type { SourceDonnee } from "@beile/contracts";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, CheckCircle2, CircleX, FileJson, Fingerprint, Landmark, Network, PlayCircle, ScrollText, Server, ShieldCheck, Workflow } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, Etiquette, PageHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { entier, nombre, pourcent } from "@/lib/format";
import { useMonde } from "@/lib/store";

/* ------------------------------------------------------------------ Raccordements (simulés) */

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
  dernierEchange: string;
  volumeJour: number;
  tauxRejet: number;
  statut: "actif" | "recette";
  etape: number; // index dans ETAPES
  icone: typeof Fingerprint;
}

const RACCORDEMENTS: Raccordement[] = [
  {
    id: "anip", nom: "Registre national des personnes", via: "ANIP, via la plateforme nationale d'interopérabilité", sens: "entrant",
    donnees: "Numéro personnel d'identification (NPI), nom, prénoms, date et lieu de naissance, filiation",
    producteurDe: "Identité civile et filiation", contrat: "identite.personne v1.2", frequence: "À la demande (inscription, vérification d'un lien parental)",
    dernierEchange: "08:27", volumeJour: 1_284, tauxRejet: 0.4, statut: "actif", etape: 4, icone: Fingerprint,
  },
  {
    id: "educmaster", nom: "EducMaster", via: "Échange de fichiers sécurisé, puis API", sens: "bidirectionnel",
    donnees: "Historique scolaire antérieur, décisions de passage, établissements déjà équipés",
    producteurDe: "Historique antérieur à BEILE", contrat: "scolarite.historique v2.0", frequence: "Quotidienne (lot de 02:00)",
    dernierEchange: "02:14", volumeJour: 18_930, tauxRejet: 1.7, statut: "actif", etape: 4, icone: Server,
  },
  {
    id: "examens", nom: "Système d'examens", via: "Direction des examens et concours, API", sens: "bidirectionnel",
    donnees: "Candidatures (sortant, sans ressaisie) ; résultats et certifications (entrant)",
    producteurDe: "Résultats d'examens et diplômes", contrat: "examens.resultat v1.1", frequence: "Par session (candidatures, délibérations)",
    dernierEchange: "07:55", volumeJour: 342, tauxRejet: 0.0, statut: "actif", etape: 4, icone: ScrollText,
  },
  {
    id: "portail", nom: "Portail national des services publics", via: "service-public.bj, API", sens: "sortant",
    donnees: "Attestations de scolarité et vérification de diplômes à la demande de l'usager",
    producteurDe: "Aucune donnée : consommateur uniquement", contrat: "attestation.scolarite v0.9", frequence: "À la demande de l'usager",
    dernierEchange: "Hier 17:42", volumeJour: 57, tauxRejet: 3.5, statut: "recette", etape: 2, icone: Landmark,
  },
];

const SENS = {
  entrant: { libelle: "Entrant vers BEILE", icone: ArrowDownLeft },
  sortant: { libelle: "Sortant de BEILE", icone: ArrowUpRight },
  bidirectionnel: { libelle: "Dans les deux sens", icone: ArrowLeftRight },
} as const;

/* ------------------------------------------------------------------ Journal des messages (simulé) */

interface Message {
  id: string;
  heure: string;
  systeme: string;
  sens: "entrant" | "sortant";
  contrat: string;
  objet: string;
  statut: "accepte" | "rejete";
  erreur?: { champ: string; attendu: string; recu: string; suite: string };
}

const MESSAGES: Message[] = [
  { id: "MSG-7F31A2", heure: "08:27:14", systeme: "Registre national", sens: "entrant", contrat: "identite.personne v1.2", objet: "Consultation NPI pour une inscription (CEG Les Rôniers)", statut: "accepte" },
  {
    id: "MSG-7F319C", heure: "08:24:51", systeme: "Registre national", sens: "entrant", contrat: "identite.personne v1.2", objet: "Réponse d'identité pour une vérification de filiation", statut: "rejete",
    erreur: { champ: "dateNaissance", attendu: "date ISO 8601 (AAAA-MM-JJ)", recu: "\"12/03/2014\"", suite: "Message renvoyé au producteur avec l'erreur. Aucune donnée partielle n'est entrée dans le registre ; la vérification reste « en attente »." },
  },
  { id: "MSG-7F3188", heure: "08:19:02", systeme: "Système d'examens", sens: "sortant", contrat: "examens.candidature v1.1", objet: "Lot de 38 candidatures BEPC (sans ressaisie)", statut: "accepte" },
  { id: "MSG-7F3160", heure: "07:55:40", systeme: "Système d'examens", sens: "entrant", contrat: "examens.resultat v1.1", objet: "Accusé de réception des candidatures", statut: "accepte" },
  { id: "MSG-7F30E2", heure: "02:14:09", systeme: "EducMaster", sens: "entrant", contrat: "scolarite.historique v2.0", objet: "Lot quotidien : 18 930 décisions de passage", statut: "accepte" },
  {
    id: "MSG-7F30D1", heure: "02:13:57", systeme: "EducMaster", sens: "entrant", contrat: "scolarite.historique v2.0", objet: "Décision de passage d'un apprenant", statut: "rejete",
    erreur: { champ: "versNiveau", attendu: "valeur du référentiel des niveaux (CI … Tle)", recu: "\"6ème\"", suite: "Ligne écartée du lot et signalée à EducMaster ; les 18 929 autres lignes sont intégrées." },
  },
  { id: "MSG-7F2F77", heure: "Hier 17:42:30", systeme: "Portail des services publics", sens: "sortant", contrat: "attestation.scolarite v0.9", objet: "Attestation de scolarité délivrée (environnement de recette)", statut: "accepte" },
];

/* ------------------------------------------------------------------ Validation de schéma réelle (zod) */

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

/* ------------------------------------------------------------------ Provenance */

const SOURCE_LIBELLE: Record<SourceDonnee, { nom: string; role: string }> = {
  beile: { nom: "BEILE", role: "Vie scolaire saisie dans les établissements : inscriptions, notes, absences, transferts" },
  educmaster: { nom: "EducMaster", role: "Historique antérieur : décisions de passage reprises sans ressaisie" },
  examens: { nom: "Système d'examens", role: "Résultats et certifications, seul producteur officiel" },
  registre_national: { nom: "Registre national des personnes", role: "Identité : consultée à la demande, jamais recopiée comme événement éducatif" },
};

export default function InteroperabilitePage() {
  const monde = useMonde();
  const [exemple, setExemple] = useState<CleExemple>("non_conforme");
  const [resultat, setResultat] = useState<{ cle: CleExemple; ok: boolean; issues: { chemin: string; message: string }[] } | null>(null);

  const provenance = useMemo(() => {
    const compte: Record<SourceDonnee, number> = { beile: 0, educmaster: 0, examens: 0, registre_national: 0 };
    for (const e of monde.evenements) compte[e.source] += 1;
    const total = monde.evenements.length || 1;
    return (Object.keys(compte) as SourceDonnee[]).map((s) => ({ source: s, n: compte[s], part: (compte[s] / total) * 100 })).sort((a, b) => b.n - a.n);
  }, [monde.evenements]);

  const volumeJour = RACCORDEMENTS.reduce((s, r) => s + r.volumeJour, 0);
  const rejetMoyen = RACCORDEMENTS.reduce((s, r) => s + r.volumeJour * r.tauxRejet, 0) / volumeJour;

  const valider = () => {
    const r = SchemaPersonne.safeParse(EXEMPLES[exemple]);
    setResultat({
      cle: exemple,
      ok: r.success,
      issues: r.success ? [] : r.error.issues.map((i) => ({ chemin: i.path.join(".") || "(racine)", message: i.message })),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Données · P12"
        titre="Interopérabilité"
        sousTitre="Les systèmes nationaux avec lesquels BEILE échange, selon des contrats d'interface versionnés. Chaque message est validé contre son schéma avant d'entrer : un message non conforme est rejeté, jamais corrigé en silence."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TuileIndicateur libelle="Raccordements" icone={Network} accent="bleu" valeur={entier(RACCORDEMENTS.length)} indice={`${RACCORDEMENTS.filter((r) => r.statut === "actif").length} en exploitation · 1 en recette`} />
        <TuileIndicateur libelle="Messages aujourd'hui" icone={Workflow} accent="sarcelle" valeur={entier(volumeJour)} indice={<Badge ton="avertissement">simulé</Badge>} />
        <TuileIndicateur libelle="Taux de rejet" icone={CircleX} accent="ambre" valeur={nombre(rejetMoyen, 2)} unite="%" indice="pondéré par le volume · simulé" />
        <TuileIndicateur libelle="Événements au registre" icone={ScrollText} accent="neutre" valeur={entier(monde.evenements.length)} indice="provenance tracée pour chacun" />
      </div>

      <Card className="border-blue/25 bg-blue-soft/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface text-accent-ink shadow-soft"><ShieldCheck size={19} aria-hidden /></span>
          <div className="min-w-0">
            <p className="font-display text-[16px] font-bold text-ink">Un système producteur unique pour chaque donnée</p>
            <p className="mt-1.5 max-w-3xl text-[14px] text-ink-2">
              Chaque donnée a un seul producteur de référence. L'identité civile appartient au registre national (ANIP) : BEILE la consulte, ne la crée
              ni ne la modifie. Les résultats d'examens appartiennent au système d'examens. BEILE produit les faits de la vie scolaire. Quand deux
              systèmes divergent, c'est le producteur qui fait foi, et l'écart est signalé, pas arbitré localement.
            </p>
          </div>
        </div>
      </Card>

      <section aria-labelledby="titre-raccordements" className="space-y-4">
        <h2 id="titre-raccordements" className="text-[18px] font-bold text-ink">Raccordements</h2>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {RACCORDEMENTS.map((r) => <CarteRaccordement key={r.id} r={r} />)}
        </div>
        <p className="text-[12px] text-ink-muted">Séquence de raccordement du document de cadrage (§9.3) : cadrage → contrat d'interface → tests → mise en service → exploitation. Volumes, horaires et taux de rejet sont simulés.</p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">Journal des derniers messages</h2>
              <p className="text-[12.5px] text-ink-muted">Chaque message porte son contrat et son résultat de validation.</p>
            </div>
            <Badge ton="avertissement">Messages simulés</Badge>
          </div>
          <ul className="divide-y divide-line/60">
            {MESSAGES.map((m) => <LigneMessage key={m.id} m={m} />)}
          </ul>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader icon={FileJson} title="Rejouer la validation" subtitle="Validation réelle, exécutée dans votre navigateur, contre le schéma identite.personne v1.2." />
            <Segmente
              label="Message à valider"
              options={[{ valeur: "non_conforme", libelle: "Message reçu" }, { valeur: "conforme", libelle: "Message corrigé" }]}
              valeur={exemple}
              onChange={(v) => { setExemple(v); setResultat(null); }}
            />
            <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-ink">
              {JSON.stringify(EXEMPLES[exemple], null, 2)}
            </pre>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button icone={PlayCircle} onClick={valider}>Valider le message</Button>
              <span className="text-[12px] text-ink-muted">Identité fictive.</span>
            </div>
            {resultat && resultat.cle === exemple && (
              <div role="status" className={cn("mt-3 animate-slide-up rounded-md border p-3 text-[13px]", resultat.ok ? "border-success/30 bg-success-bg" : "border-critical/30 bg-critical-bg")}>
                <p className={cn("flex items-center gap-2 font-semibold", resultat.ok ? "text-success" : "text-critical")}>
                  {resultat.ok ? <CheckCircle2 size={16} aria-hidden /> : <CircleX size={16} aria-hidden />}
                  {resultat.ok ? "ACCEPTÉ : conforme au contrat" : `REJETÉ : ${resultat.issues.length} erreur${resultat.issues.length > 1 ? "s" : ""} de schéma`}
                </p>
                {!resultat.ok && (
                  <ul className="mt-2 space-y-1">
                    {resultat.issues.map((i) => (
                      <li key={i.chemin} className="text-ink"><span className="font-mono text-[12px]">{i.chemin}</span> : {i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={ScrollText} title="Provenance réelle des événements" subtitle="Comptage sur le registre d'événements de la démonstration, séance comprise." />
            <ul className="space-y-3">
              {provenance.map((p) => (
                <li key={p.source}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-semibold text-ink">{SOURCE_LIBELLE[p.source].nom} <span className="font-mono text-[11px] font-normal text-ink-muted">{p.source}</span></span>
                    <span className="shrink-0 text-[13px] font-semibold tabular text-ink">{entier(p.n)} <span className="text-[11.5px] font-normal text-ink-muted">· {pourcent(p.part)}</span></span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                    <div className="h-full rounded-full bg-[var(--series-1)]" style={{ width: `${Math.max(p.n ? 1 : 0, p.part)}%` }} />
                  </div>
                  <p className="mt-1 text-[12px] text-ink-muted">{SOURCE_LIBELLE[p.source].role}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] text-ink-muted">
              {entier(monde.registre.length)} personnes du registre national sont référencées par leur NPI. Aucune n'est recopiée comme événement : c'est l'application
              du producteur unique.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Composants locaux */

function CarteRaccordement({ r }: { r: Raccordement }) {
  const Sens = SENS[r.sens];
  const Icone = r.icone;
  return (
    <article className="flex flex-col rounded-xl border border-line/70 bg-surface p-5 shadow-float">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-soft text-accent-ink"><Icone size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15.5px] font-semibold text-ink">{r.nom}</h3>
          <p className="text-[12.5px] text-ink-muted">{r.via}</p>
        </div>
        {r.statut === "actif" ? <Badge ton="succes" icone={CheckCircle2}>Actif</Badge> : <Badge ton="info" icone={Workflow}>En recette</Badge>}
      </header>

      <ol className="mt-4 grid grid-cols-5 gap-1" aria-label={`Séquence de raccordement : étape ${r.etape + 1} sur 5, ${ETAPES[r.etape]}`}>
        {ETAPES.map((e, i) => (
          <li key={e} className="min-w-0">
            <span className={cn("block h-1.5 rounded-full", i < r.etape ? "bg-teal" : i === r.etape ? "bg-blue" : "bg-surface-2")} aria-hidden />
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

      <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-surface-2/60 p-3">
        <div className="min-w-0"><Etiquette>Dernier échange</Etiquette><p className="mt-1 truncate text-[14px] font-semibold tabular text-ink">{r.dernierEchange}</p></div>
        <div className="min-w-0"><Etiquette>Volume du jour</Etiquette><p className="mt-1 text-[14px] font-semibold tabular text-ink">{entier(r.volumeJour)}</p></div>
        <div className="min-w-0">
          <Etiquette>Rejets</Etiquette>
          <p className={cn("mt-1 text-[14px] font-semibold tabular", r.tauxRejet >= 3 ? "text-warning" : "text-ink")}>
            {pourcent(r.tauxRejet)}{r.tauxRejet >= 3 && <span className="sr-only"> (élevé)</span>}
          </p>
        </div>
      </div>
    </article>
  );
}

function LigneMessage({ m }: { m: Message }) {
  const [ouvert, setOuvert] = useState(m.statut === "rejete" && m.id === "MSG-7F319C");
  const rejete = m.statut === "rejete";
  return (
    <li className={cn("px-5 py-3", rejete && "bg-critical-bg/40")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[5.5rem] shrink-0 font-mono text-[12px] tabular text-ink-muted">{m.heure}</span>
        {rejete ? <Badge ton="critique" icone={CircleX}>REJETÉ</Badge> : <Badge ton="succes" icone={CheckCircle2}>Accepté</Badge>}
        <span className="inline-flex items-center gap-1 text-[12px] text-ink-2">
          {m.sens === "entrant" ? <ArrowDownLeft size={13} aria-hidden /> : <ArrowUpRight size={13} aria-hidden />}
          {m.systeme}
        </span>
        <span className="font-mono text-[11.5px] text-ink-muted">{m.contrat}</span>
      </div>
      <p className="mt-1 text-[13px] text-ink">{m.objet}</p>
      {rejete && m.erreur && (
        <>
          <button onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="mt-1 text-[12.5px] font-semibold text-blue hover:underline">
            {ouvert ? "Masquer le détail de l'erreur" : "Voir le détail de l'erreur"}
          </button>
          {ouvert && (
            <div className="mt-2 animate-fade-in rounded-md border border-critical/25 bg-surface p-3 text-[12.5px]">
              <p className="font-mono text-[11.5px] text-ink-muted">{m.id} · validation de schéma</p>
              <dl className="mt-2 grid gap-1.5 sm:grid-cols-[7rem_1fr]">
                <dt className="text-ink-muted">Champ</dt><dd className="font-mono text-ink">{m.erreur.champ}</dd>
                <dt className="text-ink-muted">Attendu</dt><dd className="text-ink">{m.erreur.attendu}</dd>
                <dt className="text-ink-muted">Reçu</dt><dd className="font-mono text-critical">{m.erreur.recu}</dd>
                <dt className="text-ink-muted">Suite donnée</dt><dd className="text-ink-2">{m.erreur.suite}</dd>
              </dl>
            </div>
          )}
        </>
      )}
    </li>
  );
}
