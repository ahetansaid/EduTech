"use client";

import { AlertTriangle, ArrowLeft, Bug, CircleHelp, Database, Headset, Inbox, KeyRound, LifeBuoy, MessageSquareText, RefreshCw, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense, useState, type FormEvent } from "react";
import { DetailDemande } from "@/components/assistance/DetailDemande";
import { AnimatePresence, EASE, EntreePage, motion } from "@/components/motion";
import { GardeSession } from "@/components/shell/GardeSession";
import { MenuUtilisateur } from "@/components/shell/MenuUtilisateur";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { BandeNationale, Badge, Button, Card, CardHeader, EtatVide, Logo, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_CATEGORIE, LIBELLE_PRIORITE, LIBELLE_STATUT, TON_PRIORITE, TON_STATUT, useCreerDemandeMutation, useMesDemandes,
  type Categorie, type Priorite, type Ticket,
} from "@/lib/api/administration";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";
import { accueilPour, useRoles } from "@/lib/session";
import { useTitre } from "@/lib/titre";

const CATEGORIES: { valeur: Categorie; icone: typeof Bug; aide: string }[] = [
  { valeur: "connexion", icone: KeyRound, aide: "Mot de passe, session, verrouillage" },
  { valeur: "acces", icone: ShieldAlert, aide: "Écran ou droit manquant" },
  { valeur: "donnees", icone: Database, aide: "Information inexacte ou absente" },
  { valeur: "bug", icone: Bug, aide: "Erreur, écran qui ne répond pas" },
  { valeur: "autre", icone: CircleHelp, aide: "Toute autre question" },
];
const CHAMP = "h-10 w-full rounded-md border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15";
const TZ = "Africa/Porto-Novo";
const date = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** Assistance : ouverte à tout utilisateur connecté, quel que soit son rôle. */
export default function PageAssistance() {
  return <Suspense><GardeSession><Assistance /></GardeSession></Suspense>;
}

function Assistance() {
  useTitre("Assistance");
  const accueil = accueilPour(useRoles());
  const [ouverte, setOuverte] = useState<Ticket | null>(null);

  return (
    <div className="min-h-screen bg-bg">
      <BandeNationale className="h-[4px]" />
      <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href={accueil} aria-label="Retour à mon espace" className="shrink-0"><Logo /></Link>
          <div className="flex min-w-0 items-center gap-2">
            <Link href={accueil} className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-ink-2 hover:bg-surface-2">
              <ArrowLeft size={15} aria-hidden /> <span className="hidden sm:inline">Retour à mon espace</span><span className="sm:hidden">Retour</span>
            </Link>
            <MenuUtilisateur compact vers="bas" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <EntreePage>
          <div className="space-y-5">
            <PageHeader surtitre="Assistance" titre="Besoin d'aide ?" sousTitre="Décrivez votre difficulté : l'équipe d'administration de BEILE vous répond ici, dans le fil de votre demande." />
            <div className="grid gap-5 lg:grid-cols-5">
              <div className="min-w-0 lg:col-span-2"><NouvelleDemande onCreee={setOuverte} /></div>
              <div className="min-w-0 lg:col-span-3"><MesDemandes onOuvrir={setOuverte} /></div>
            </div>
          </div>
        </EntreePage>
      </main>

      <Modale ouvert={!!ouverte} onFermer={() => setOuverte(null)} large titre="Ma demande" sousTitre={ouverte?.id} icone={MessageSquareText}>
        {ouverte && <DetailDemande id={ouverte.id} />}
      </Modale>
    </div>
  );
}

/* ------------------------------------------------------------------ Nouvelle demande */

function NouvelleDemande({ onCreee }: { onCreee: (t: Ticket) => void }) {
  const [categorie, setCategorie] = useState<Categorie | null>(null);
  const [priorite, setPriorite] = useState<Priorite>("normale");
  const [sujet, setSujet] = useState("");
  const [description, setDescription] = useState("");
  const [tente, setTente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const creer = useCreerDemandeMutation();

  const erreurs = {
    categorie: !categorie ? "Choisissez une catégorie." : null,
    sujet: sujet.trim().length < 5 ? "5 caractères au moins." : null,
    description: description.trim().length < 10 ? "Décrivez la difficulté (10 caractères au moins)." : null,
  };
  const soumettre = async (e: FormEvent) => {
    e.preventDefault();
    setTente(true);
    setErreur(null);
    if (Object.values(erreurs).some(Boolean) || !categorie) return;
    try {
      const t = await creer.mutateAsync({ categorie, priorite, sujet: sujet.trim(), description: description.trim() });
      notifier({ ton: "succes", titre: "Demande envoyée", texte: `Référence ${t.id}. Vous serez notifié de la réponse.` });
      setCategorie(null); setPriorite("normale"); setSujet(""); setDescription(""); setTente(false);
      onCreee(t);
    } catch (x) {
      setErreur(x instanceof ErreurApi && x.statut === 429 ? "Vous avez envoyé plusieurs demandes en peu de temps : réessayez dans quelques minutes." : (x as Error).message);
    }
  };

  return (
    <Card className="min-w-0" data-guide="assistance-nouvelle">
      <CardHeader title="Nouvelle demande" subtitle="Une demande par difficulté : elle est suivie jusqu'à sa résolution." icon={LifeBuoy} />
      <form onSubmit={soumettre} className="space-y-4" noValidate>
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium text-ink">Catégorie</legend>
          <div role="radiogroup" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {CATEGORIES.map((c) => {
              const actif = categorie === c.valeur;
              return (
                <button key={c.valeur} type="button" role="radio" aria-checked={actif} onClick={() => setCategorie(c.valeur)}
                  className={cn("relative flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 text-left transition active:scale-[0.98]", actif ? "border-blue bg-blue-soft/60" : "border-line hover:bg-surface-2")}>
                  <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", actif ? "bg-surface text-accent-ink" : "bg-surface-2 text-ink-muted")}><c.icone size={16} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{LIBELLE_CATEGORIE[c.valeur]}</span>
                    <span className="block truncate text-xs text-ink-muted">{c.aide}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {tente && erreurs.categorie && <p className="mt-1 text-xs text-critical" role="alert">{erreurs.categorie}</p>}
        </fieldset>

        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium text-ink">Urgence</p>
          <div className="max-w-full overflow-x-auto">
            <Segmente label="Urgence" valeur={priorite} onChange={setPriorite} options={(["basse", "normale", "haute", "critique"] as const).map((p) => ({ valeur: p, libelle: LIBELLE_PRIORITE[p] }))} />
          </div>
          <p className="mt-1 text-xs text-ink-muted">« Critique » : service inutilisable pour un établissement entier.</p>
        </div>

        <div className="min-w-0">
          <label htmlFor="sujet" className="mb-1.5 flex justify-between text-sm font-medium text-ink">Sujet <span className="text-xs font-normal tabular-nums text-ink-muted">{sujet.length}/140</span></label>
          <input id="sujet" maxLength={140} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. « La classe de 3e B n'apparaît plus »" className={CHAMP} />
          {tente && erreurs.sujet && <p className="mt-1 text-xs text-critical" role="alert">{erreurs.sujet}</p>}
        </div>

        <div className="min-w-0">
          <label htmlFor="description" className="mb-1.5 flex justify-between text-sm font-medium text-ink">Description <span className="text-xs font-normal tabular-nums text-ink-muted">{description.length}/4000</span></label>
          <textarea id="description" rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Ce que vous faisiez, ce qui s'est passé, depuis quand…" className="w-full resize-y rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15" />
          {tente && erreurs.description && <p className="mt-1 text-xs text-critical" role="alert">{erreurs.description}</p>}
        </div>

        <p className="flex items-start gap-2 rounded-md bg-surface-2/70 px-3 py-2 text-xs text-ink-2">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
          N'indiquez jamais votre mot de passe : l'administration ne vous le demandera pas.
        </p>

        <AnimatePresence>
          {erreur && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /><span className="min-w-0 break-words">{erreur}</span>
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex justify-end">
          <Button type="submit" icone={Send} chargement={creer.isPending} className="w-full sm:w-auto">Envoyer la demande</Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ Mes demandes */

function MesDemandes({ onOuvrir }: { onOuvrir: (t: Ticket) => void }) {
  const q = useMesDemandes();
  const [filtre, setFiltre] = useState<"en_cours" | "toutes">("en_cours");
  const liste = (q.data ?? []).filter((t) => filtre === "toutes" || t.statut === "ouvert" || t.statut === "en_cours");

  return (
    <Card className="min-w-0 p-0" data-guide="assistance-liste">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Mes demandes</h2>
          <p className="text-[13px] text-ink-muted">{q.data ? `${q.data.length} au total` : "Suivi et échanges"}</p>
        </div>
        <Segmente label="Afficher" valeur={filtre} onChange={setFiltre} options={[{ valeur: "en_cours", libelle: "En cours" }, { valeur: "toutes", libelle: "Toutes" }]} />
      </div>
      {q.isPending ? (
        <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <Squelette key={i} className="h-16 w-full" />)}</div>
      ) : q.isError ? (
        <EtatVide icone={RefreshCw} titre="Vos demandes sont indisponibles" texte={q.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} />
      ) : liste.length === 0 ? (
        <EtatVide icone={Inbox} titre={filtre === "en_cours" && q.data.length ? "Aucune demande en cours" : "Aucune demande"} texte={filtre === "en_cours" && q.data.length ? "Vos demandes résolues ou closes restent consultables dans « Toutes »." : "Utilisez le formulaire pour décrire votre difficulté."} />
      ) : (
        <ul className="divide-y divide-line/60">
          <AnimatePresence initial={false}>
            {liste.map((t, i) => {
              const reponse = t.reponseAdministration && (t.statut === "ouvert" || t.statut === "en_cours");
              return (
                <motion.li key={t.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.035 }}>
                  <button type="button" onClick={() => onOuvrir(t)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-2/60">
                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", reponse ? "bg-blue" : t.statut === "resolu" ? "bg-success" : t.statut === "clos" ? "bg-ink-muted" : "bg-warning")} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-ink">{t.sujet}</span>
                        <span className="shrink-0 text-xs text-ink-muted">{date(t.majLe)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-muted">{LIBELLE_CATEGORIE[t.categorie]} · <span className="font-mono">{t.id}</span>{t.assigneNom ? ` · suivie par ${t.assigneNom}` : ""}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        <Badge ton={TON_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</Badge>
                        {(t.priorite === "haute" || t.priorite === "critique") && <Badge ton={TON_PRIORITE[t.priorite]}>{LIBELLE_PRIORITE[t.priorite]}</Badge>}
                        {reponse && <Badge ton="marque" icone={Headset}>Réponse reçue</Badge>}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
