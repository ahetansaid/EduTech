"use client";

import { Archive, ClipboardCheck, ScrollText, EyeOff, FileCheck2, Filter, Gavel, GraduationCap, Landmark, Search, ShieldCheck, Sparkles, UserPlus, Users, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Card, CardHeader, EtatVide, Etiquette, PageHeader, Segmente } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";

/* ------------------------------------------------------------------ Registre des traitements (article du registre tenu par le DPO) */

type Criticite = 1 | 2 | 3 | 4;
type Saisine = "avis_favorable" | "en_instruction" | "a_saisir";

interface Traitement {
  id: string;
  nom: string;
  icone: LucideIcon;
  finalite: string;
  baseLegale: string;
  categories: string[];
  sensibles?: string;
  personnes: string;
  destinataires: string[];
  conservation: string;
  mesures: string[];
  criticite: Criticite;
  saisine: Saisine;
}

const CRITICITE: Record<Criticite, { libelle: string; ton: "critique" | "avertissement" | "info" | "neutre" }> = {
  4: { libelle: "Hautement sensible", ton: "critique" },
  3: { libelle: "Personnel", ton: "avertissement" },
  2: { libelle: "Professionnel", ton: "info" },
  1: { libelle: "Public", ton: "neutre" },
};

const SAISINE: Record<Saisine, { libelle: string; ton: "succes" | "info" | "avertissement" }> = {
  avis_favorable: { libelle: "APDP : avis favorable", ton: "succes" },
  en_instruction: { libelle: "APDP : en instruction", ton: "info" },
  a_saisir: { libelle: "APDP : à saisir", ton: "avertissement" },
};

const TRAITEMENTS: Traitement[] = [
  {
    id: "T01", nom: "Inscription et identité éducative", icone: UserPlus,
    finalite: "Inscrire un apprenant, lui attribuer un identifiant éducatif stable rattaché à son identité nationale, et l'affecter dans une classe.",
    baseLegale: "Mission de service public d'éducation (loi d'orientation de l'éducation nationale)",
    categories: ["Identité (NPI, nom, prénoms, date de naissance, sexe)", "Filiation et responsables légaux", "Établissement et classe"],
    sensibles: "Besoins éducatifs particuliers (information minimale, sans diagnostic)",
    personnes: "Apprenants, responsables légaux",
    destinataires: ["Établissement d'accueil", "Responsables légaux", "Registre national des personnes (vérification seulement)"],
    conservation: "Durée de la scolarité + 5 ans pour le dossier ; identifiant éducatif conservé à vie (preuve des diplômes)",
    mesures: ["Contrôle d'accès à quatre critères", "Vérification au registre national sans recopie", "Enfant sans acte : inscrit, signalé, régularisation suivie"],
    criticite: 4, saisine: "avis_favorable",
  },
  {
    id: "T02", nom: "Suivi pédagogique et vie scolaire", icone: ClipboardCheck,
    finalite: "Enregistrer les absences et les évaluations, produire les bulletins, prévenir le décrochage.",
    baseLegale: "Mission de service public d'éducation",
    categories: ["Évaluations et notes", "Absences et justifications", "Alertes de décrochage (proposées, validées par un humain)"],
    personnes: "Apprenants",
    destinataires: ["Enseignants de la classe", "Chef d'établissement", "Responsables légaux"],
    conservation: "Année scolaire + 3 ans ; bulletins conservés avec le dossier",
    mesures: ["Relation pédagogique exigée pour chaque lecture", "Correction de note journalisée, avec son auteur", "Aucune décision automatique : l'alerte est proposée"],
    criticite: 3, saisine: "avis_favorable",
  },
  {
    id: "T03", nom: "Examens et certification", icone: GraduationCap,
    finalite: "Inscrire les candidats sans ressaisie, publier les résultats et délivrer des diplômes vérifiables.",
    baseLegale: "Mission de service public ; textes régissant les examens nationaux (CEP, BEPC, baccalauréat)",
    categories: ["Identité du candidat", "Résultats et mentions", "Empreinte cryptographique du diplôme"],
    personnes: "Candidats",
    destinataires: ["Direction des examens et concours", "Titulaire du diplôme", "Tiers vérificateur (réponse oui/non, sans compte)"],
    conservation: "Résultats et diplômes : conservation définitive (valeur probante)",
    mesures: ["Signature et empreinte de chaque diplôme", "Vérification publique limitée au strict nécessaire", "Registre des résultats en ajout seul"],
    criticite: 4, saisine: "avis_favorable",
  },
  {
    id: "T04", nom: "Statistiques et pilotage", icone: Landmark,
    finalite: "Produire les indicateurs du dictionnaire national pour le pilotage du système éducatif.",
    baseLegale: "Mission de service public ; loi sur la statistique publique",
    categories: ["Données agrégées par territoire, niveau, sexe, milieu"],
    personnes: "Apprenants et personnels (indirectement, sous forme agrégée)",
    destinataires: ["Administration centrale", "Directions départementales", "Inspections", "Chercheurs sous convention"],
    conservation: "Séries agrégées conservées sans limite ; aucune donnée nominative dans l'entrepôt statistique",
    mesures: ["Pseudonymisation avant tout usage analytique", "Suppression des petites cellules (seuil par indicateur)", "Périmètre territorial appliqué à chaque requête"],
    criticite: 1, saisine: "avis_favorable",
  },
  {
    id: "T05", nom: "Ask Education (assistant de questions)", icone: Sparkles,
    finalite: "Traduire une question en langage courant en requête sur le dictionnaire national, puis restituer le chiffre calculé par le moteur.",
    baseLegale: "Mission de service public (aide au pilotage)",
    categories: ["Texte de la question", "Requête structurée produite", "Résultat agrégé"],
    personnes: "Agents habilités (auteurs des questions)",
    destinataires: ["Auteur de la question", "Délégué à la protection des données (journal)"],
    conservation: "Questions et requêtes : 12 mois dans le journal d'audit",
    mesures: ["Le modèle de langage ne reçoit aucune donnée, seulement la question et le catalogue", "Refus motivé et journalisé hors périmètre", "Aucune donnée individuelle restituée"],
    criticite: 2, saisine: "en_instruction",
  },
  {
    id: "T06", nom: "Vérification publique des diplômes", icone: FileCheck2,
    finalite: "Permettre à un tiers (employeur, université) de vérifier l'authenticité d'un diplôme par QR code, sans compte.",
    baseLegale: "Mission de service public ; démarche à l'initiative du titulaire",
    categories: ["Identifiant du diplôme", "Nom du titulaire, examen, session, mention (affichés uniquement si le diplôme est authentique)"],
    personnes: "Titulaires de diplômes",
    destinataires: ["Tiers vérificateur, pour ce seul diplôme"],
    conservation: "Journal des vérifications : 12 mois",
    mesures: ["Limitation du débit contre l'aspiration", "Aucune recherche par nom possible", "Document altéré détecté par l'empreinte"],
    criticite: 2, saisine: "a_saisir",
  },
];

const PRINCIPES: { icone: LucideIcon; titre: string; texte: string }[] = [
  { icone: Filter, titre: "Minimisation", texte: "Chaque traitement ne collecte que ce que sa finalité exige. Les besoins particuliers sont notés sans diagnostic médical." },
  { icone: EyeOff, titre: "Pseudonymisation des usages analytiques", texte: "Les statistiques sont calculées sur des données pseudonymisées ; l'entrepôt statistique ne contient aucun nom." },
  { icone: Users, titre: "Suppression des petites cellules", texte: "Sous le seuil de publication d'un indicateur (1 à 10 apprenants selon le cas), la valeur est masquée pour empêcher toute réidentification." },
  { icone: Gavel, titre: "Saisine préalable de l'APDP", texte: "Chaque traitement est déclaré à l'Autorité de protection des données personnelles avant sa mise en service, et son avis est versé au registre." },
  { icone: Archive, titre: "Durées de conservation", texte: "Chaque donnée a une durée fixée par finalité. À échéance, elle est supprimée ou rendue anonyme ; l'opération est journalisée." },
  { icone: ShieldCheck, titre: "Traçabilité", texte: "Toute lecture de donnée individuelle, accordée ou refusée, est inscrite au journal d'audit en ajout seul." },
];

/* ------------------------------------------------------------------ Page */

export default function TraitementsPage() {
  const [recherche, setRecherche] = useState("");
  const [niveau, setNiveau] = useState<"tous" | "4" | "3" | "2" | "1">("tous");

  const filtres = useMemo(() => {
    const q = normaliser(recherche.trim());
    return TRAITEMENTS.filter((t) =>
      (niveau === "tous" || t.criticite === Number(niveau)) &&
      (!q || [t.nom, t.finalite, t.baseLegale, ...t.categories, ...t.destinataires].some((x) => normaliser(x).includes(q))),
    );
  }, [recherche, niveau]);

  const hautementSensibles = TRAITEMENTS.filter((t) => t.criticite === 4).length;
  const avisFavorables = TRAITEMENTS.filter((t) => t.saisine === "avis_favorable").length;

  return (
    <EntreePage>
    <div className="space-y-6">
      <PageHeader
        surtitre="Conformité · P14"
        titre="Registre des traitements"
        sousTitre="Chaque usage de données personnelles, avec sa finalité, sa base légale, ses destinataires et sa durée de conservation. C'est le document que l'Autorité de protection des données personnelles (APDP) peut demander à tout moment."
        actions={<Link href="/audit" className="inline-flex h-8 items-center gap-2 rounded-md bg-surface px-3 text-[13px] font-medium text-ink ring-1 ring-inset ring-line transition-all hover:bg-surface-2 active:scale-[0.97]"><ScrollText size={14} aria-hidden />Journal d'audit</Link>}
      />

      <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle="Traitements déclarés" icone={ClipboardCheck} accent="bleu" valeur={entier(TRAITEMENTS.length)} indice="tous avec une finalité unique" /></Element>
        <Element><TuileIndicateur libelle="Hautement sensibles" icone={ShieldCheck} accent="critique" valeur={entier(hautementSensibles)} indice="niveau 4 : identité, certification" /></Element>
        <Element><TuileIndicateur libelle="Avis de l'APDP" icone={Gavel} accent="sarcelle" valeur={`${avisFavorables}/${TRAITEMENTS.length}`} indice="avis favorables obtenus" /></Element>
        <Element><TuileIndicateur libelle="Mise en service" icone={FileCheck2} accent="ambre" valeur="Après avis" indice="aucun traitement sans saisine" /></Element>
      </Cascade>

      <section aria-labelledby="titre-principes">
        <h2 id="titre-principes" className="mb-3 text-[18px] font-bold text-ink">Principes appliqués à tous les traitements</h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PRINCIPES.map((p) => (
            <li key={p.titre} className="rounded-lg border border-line/70 bg-surface p-4 shadow-float">
              <span className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-soft text-accent-ink"><p.icone size={16} aria-hidden /></span>
                <span className="text-[14px] font-semibold text-ink">{p.titre}</span>
              </span>
              <p className="mt-2 text-[13px] text-ink-2">{p.texte}</p>
            </li>
          ))}
        </ul>
      </section>

      <Card className="p-0">
        <div className="flex flex-col gap-3 border-b border-line/60 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <label htmlFor="recherche-traitements" className="text-[12px] font-semibold text-ink-2">Rechercher un traitement</label>
            <div className="relative mt-1.5 max-w-md">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input
                id="recherche-traitements"
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Finalité, donnée, destinataire…"
                className="h-10 w-full rounded-sm border border-line bg-surface pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-muted"
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="mb-1.5 text-[12px] font-semibold text-ink-2">Niveau de criticité</p>
            <div className="max-w-full overflow-x-auto">
              <Segmente
                label="Filtrer par niveau de criticité"
                options={[{ valeur: "tous", libelle: "Tous" }, { valeur: "4", libelle: "4" }, { valeur: "3", libelle: "3" }, { valeur: "2", libelle: "2" }, { valeur: "1", libelle: "1" }]}
                valeur={niveau}
                onChange={setNiveau}
              />
            </div>
          </div>
        </div>

        {filtres.length ? (
          <ul className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
            {filtres.map((t, i) => <li key={t.id} className="animate-row" style={{ animationDelay: `${i * 30}ms` }}><FicheTraitement t={t} /></li>)}
          </ul>
        ) : (
          <EtatVide
            icone={Search}
            titre="Aucun traitement ne correspond"
            texte="Modifiez la recherche ou le niveau de criticité."
            action={<button onClick={() => { setRecherche(""); setNiveau("tous"); }} className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue hover:underline"><X size={14} aria-hidden /> Effacer les filtres</button>}
          />
        )}
      </Card>

      <Card>
        <CardHeader icon={ShieldCheck} title="Niveaux de criticité" subtitle="Ils fixent les mesures de sécurité et les objectifs de continuité (voir l'état du service)." />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {([4, 3, 2, 1] as Criticite[]).map((n) => (
            <li key={n} className="flex items-center gap-3 rounded-lg bg-surface-2/60 p-3">
              <NiveauPastille n={n} />
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink">{CRITICITE[n].libelle}</span>
                <span className="block text-[12px] text-ink-muted">{TRAITEMENTS.filter((t) => t.criticite === n).length} traitement(s)</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Fiche d'un traitement */

function FicheTraitement({ t }: { t: Traitement }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-line/70 bg-surface p-4 shadow-soft">
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-soft text-accent-ink"><t.icone size={17} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11.5px] text-ink-muted">{t.id}</p>
          <h3 className="text-[15.5px] font-semibold text-ink">{t.nom}</h3>
        </div>
        <NiveauPastille n={t.criticite} />
      </header>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge ton={CRITICITE[t.criticite].ton}>Niveau {t.criticite} · {CRITICITE[t.criticite].libelle}</Badge>
        <Badge ton={SAISINE[t.saisine].ton} icone={Gavel}>{SAISINE[t.saisine].libelle}</Badge>
      </div>

      <dl className="mt-3 space-y-2.5 text-[13px]">
        <Champ libelle="Finalité"><span className="text-ink">{t.finalite}</span></Champ>
        <Champ libelle="Base légale"><span className="text-ink">{t.baseLegale}</span></Champ>
        <Champ libelle="Personnes concernées"><span className="text-ink">{t.personnes}</span></Champ>
        <Champ libelle="Catégories de données">
          <ul className="list-disc space-y-0.5 pl-4 text-ink">
            {t.categories.map((c) => <li key={c}>{c}</li>)}
            {t.sensibles && <li><span className="font-semibold">Donnée sensible :</span> {t.sensibles}</li>}
          </ul>
        </Champ>
        <Champ libelle="Destinataires">
          <ul className="flex flex-wrap gap-1.5">{t.destinataires.map((d) => <li key={d} className="min-w-0"><Badge ton="neutre" className="whitespace-normal">{d}</Badge></li>)}</ul>
        </Champ>
        <Champ libelle="Durée de conservation">
          <span className="inline-flex items-start gap-1.5 text-ink"><Archive size={13} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />{t.conservation}</span>
        </Champ>
        <Champ libelle="Mesures de sécurité">
          <ul className="space-y-1">
            {t.mesures.map((m) => (
              <li key={m} className="flex items-start gap-1.5 text-ink"><ShieldCheck size={13} className="mt-0.5 shrink-0 text-success" aria-hidden />{m}</li>
            ))}
          </ul>
        </Champ>
      </dl>
    </article>
  );
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt><Etiquette>{libelle}</Etiquette></dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

function NiveauPastille({ n }: { n: Criticite }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-sm font-display leading-none",
        n === 4 ? "bg-critical-bg text-critical" : n === 3 ? "bg-warning-bg text-warning" : n === 2 ? "bg-info-bg text-info" : "bg-surface-2 text-ink-2",
      )}
      aria-label={`Niveau de criticité ${n} sur 4`}
      role="img"
    >
      <span className="text-[15px] font-bold">{n}</span>
      <span className="text-[8.5px] font-semibold">/4</span>
    </span>
  );
}

function normaliser(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
