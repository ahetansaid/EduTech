"use client";

import { ArrowLeft, CircleDot, Headset, Inbox, MessageSquareReply, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DetailDemande } from "@/components/assistance/DetailDemande";
import { AnimatePresence, Cascade, Compteur, EASE, Element, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, EtatVide, Segmente, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_CATEGORIE, LIBELLE_PRIORITE, LIBELLE_STATUT, TON_PRIORITE, TON_STATUT, useFileTickets,
  type Categorie, type FiltresTickets, type Priorite, type StatutTicket, type Ticket,
} from "@/lib/api/administration";
import { cn } from "@/lib/cn";
import { entier } from "@/lib/format";
import { CHAMP, ilYA } from "./communs";

export const FILTRES_DEFAUT: FiltresTickets = { statut: "actifs", categorie: null, priorite: null, assigne: null, q: "" };
const POIDS: Record<Priorite, number> = { critique: 0, haute: 1, normale: 2, basse: 3 };

/**
 * File des demandes d'assistance : compteurs par statut, filtres, liste triée (priorité puis fraîcheur) et détail
 * avec fil de messages. Côte à côte sur grand écran ; sur mobile, le détail remplace la liste (retour explicite).
 */
export function Support() {
  const [filtres, setFiltres] = useState<FiltresTickets>(FILTRES_DEFAUT);
  const [saisie, setSaisie] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => { const t = setTimeout(() => setQ(saisie.trim().length >= 2 ? saisie.trim() : ""), 300); return () => clearTimeout(t); }, [saisie]);
  const file = useFileTickets({ ...filtres, q });
  const maintenant = file.dataUpdatedAt;
  const tickets = useMemo(() => [...(file.data?.tickets ?? [])].sort((a, b) => {
    const actifA = a.statut === "ouvert" || a.statut === "en_cours", actifB = b.statut === "ouvert" || b.statut === "en_cours";
    if (actifA !== actifB) return actifA ? -1 : 1;
    return actifA && POIDS[a.priorite] !== POIDS[b.priorite] ? POIDS[a.priorite] - POIDS[b.priorite] : Date.parse(b.majLe) - Date.parse(a.majLe);
  }), [file.data]);
  const compteurs = file.data?.compteurs;
  const maj = (p: Partial<FiltresTickets>) => { setFiltres((f) => ({ ...f, ...p })); };

  return (
    <div className="space-y-5">
      {compteurs ? (
        <Cascade className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(["ouvert", "en_cours", "resolu", "clos"] as const).map((s) => (
            <Element key={s}>
              <TuileIndicateur libelle={s === "ouvert" ? "Nouvelles" : s === "en_cours" ? "En cours" : s === "resolu" ? "Résolues" : "Closes"} icone={s === "ouvert" ? Inbox : s === "en_cours" ? MessageSquareReply : s === "resolu" ? CircleDot : X}
                accent={s === "ouvert" && compteurs.ouvert ? "ambre" : s === "en_cours" ? "bleu" : s === "resolu" ? "sarcelle" : "neutre"}
                valeur={<Compteur valeur={compteurs[s]} format={entier} />} indice={filtres.statut === s ? "filtre actif" : "cliquer pour filtrer"}
                onClick={() => maj({ statut: filtres.statut === s ? "actifs" : s })} className={cn("w-full text-left", filtres.statut === s && "ring-2 ring-blue/40")} />
            </Element>
          ))}
        </Cascade>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className={cn("min-w-0 space-y-3", selection && "hidden lg:block")} data-guide="admin-support">
          <Card className="min-w-0 space-y-3 p-3">
            <label className="relative block min-w-0">
              <span className="sr-only">Rechercher une demande</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
              <input type="search" value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Sujet, référence, auteur…" className={cn(CHAMP, "pl-9")} />
            </label>
            <div className="max-w-full overflow-x-auto">
              <Segmente label="Statut" valeur={filtres.statut ?? "tous"} onChange={(v) => maj({ statut: v === "tous" ? null : (v as StatutTicket | "actifs") })}
                options={[{ valeur: "actifs", libelle: "À traiter" }, { valeur: "resolu", libelle: "Résolues" }, { valeur: "clos", libelle: "Closes" }, { valeur: "tous", libelle: "Toutes" }]} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-2">
              <select aria-label="Catégorie" value={filtres.categorie ?? ""} onChange={(e) => maj({ categorie: (e.target.value || null) as Categorie | null })} className={CHAMP}>
                <option value="">Catégorie</option>
                {(Object.keys(LIBELLE_CATEGORIE) as Categorie[]).map((c) => <option key={c} value={c}>{LIBELLE_CATEGORIE[c]}</option>)}
              </select>
              <select aria-label="Priorité" value={filtres.priorite ?? ""} onChange={(e) => maj({ priorite: (e.target.value || null) as Priorite | null })} className={CHAMP}>
                <option value="">Priorité</option>
                {(Object.keys(LIBELLE_PRIORITE) as Priorite[]).map((p) => <option key={p} value={p}>{LIBELLE_PRIORITE[p]}</option>)}
              </select>
              <select aria-label="Prise en charge" value={filtres.assigne ?? ""} onChange={(e) => maj({ assigne: (e.target.value || null) as FiltresTickets["assigne"] })} className={cn(CHAMP, "lg:col-span-2")}>
                <option value="">Prise en charge : toutes</option>
                <option value="moi">Prises par moi</option>
                <option value="personne">Non prises en charge</option>
              </select>
            </div>
          </Card>

          {file.isPending ? (
            <Card className="space-y-3 p-3">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-16 w-full" />)}</Card>
          ) : file.isError ? (
            <Card><EtatVide icone={RefreshCw} titre="File indisponible" texte={file.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => file.refetch()}>Réessayer</Button>} /></Card>
          ) : tickets.length === 0 ? (
            <Card><EtatVide icone={Headset} titre="Aucune demande" texte={filtres.statut === "actifs" ? "Rien à traiter pour le moment." : "Aucune demande ne correspond à ces filtres."} action={<Button variante="secondaire" taille="sm" icone={X} onClick={() => { setFiltres(FILTRES_DEFAUT); setSaisie(""); }}>Réinitialiser les filtres</Button>} /></Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-line/60">
                <AnimatePresence initial={false}>
                  {tickets.map((t, i) => <LigneTicket key={t.id} t={t} i={i} actif={t.id === selection} maintenant={maintenant} onClick={() => setSelection(t.id)} />)}
                </AnimatePresence>
              </ul>
            </Card>
          )}
        </div>

        <div className={cn("min-w-0", !selection && "hidden lg:block")}>
          <Card className="min-w-0 p-4 sm:p-5 lg:sticky lg:top-4">
            {selection ? (
              <>
                <Button variante="fantome" taille="sm" icone={ArrowLeft} className="-ml-2 mb-3 h-10 lg:hidden" onClick={() => setSelection(null)}>File des demandes</Button>
                <AnimatePresence mode="wait">
                  <motion.div key={selection} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease: EASE }}>
                    <DetailDemande id={selection} admin />
                  </motion.div>
                </AnimatePresence>
              </>
            ) : (
              <EtatVide icone={MessageSquareReply} titre="Sélectionnez une demande" texte="Son fil de messages s'affiche ici : répondez, changez le statut ou prenez-la en charge." />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function LigneTicket({ t, i, actif, maintenant, onClick }: { t: Ticket; i: number; actif: boolean; maintenant: number; onClick: () => void }) {
  const attente = t.statut === "ouvert" || (t.statut === "en_cours" && !t.reponseAdministration);
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE, delay: Math.min(i, 12) * 0.035 }}>
      <button type="button" onClick={onClick} aria-current={actif ? "true" : undefined}
        className={cn("relative flex w-full items-start gap-3 px-4 py-3 text-left transition-colors", actif ? "bg-blue-soft/60" : "hover:bg-surface-2/60")}>
        {actif && <motion.span layoutId="ticket-actif" className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-blue" aria-hidden />}
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", attente ? "bg-warning" : t.statut === "resolu" ? "bg-success" : t.statut === "clos" ? "bg-ink-muted" : "bg-info")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-ink">{t.sujet}</span>
            <span className="shrink-0 text-xs text-ink-muted">{ilYA(t.majLe, maintenant, "")}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">{t.auteurNom} · {LIBELLE_CATEGORIE[t.categorie]} · <span className="font-mono">{t.id}</span></span>
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge ton={TON_STATUT[t.statut]}>{LIBELLE_STATUT[t.statut]}</Badge>
            {(t.priorite === "haute" || t.priorite === "critique") && <Badge ton={TON_PRIORITE[t.priorite]}>{LIBELLE_PRIORITE[t.priorite]}</Badge>}
            {t.messages > 0 && <Badge>{t.messages} message{t.messages > 1 ? "s" : ""}</Badge>}
            {t.assigneAMoi && <Badge ton="marque">Moi</Badge>}
          </span>
        </span>
      </button>
    </motion.li>
  );
}
