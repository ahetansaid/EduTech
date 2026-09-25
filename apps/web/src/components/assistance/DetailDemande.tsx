"use client";

import { ArchiveX, CheckCircle2, Headset, Loader2, RefreshCw, Send, UserCheck, UserMinus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, EtatVide, Segmente, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_CATEGORIE, LIBELLE_PRIORITE, LIBELLE_STATUT, TON_PRIORITE, TON_STATUT, useAssignationMutation, useClore, useDemande, useRepondreMutation,
  useStatutTicketMutation, type StatutTicket,
} from "@/lib/api/administration";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const TZ = "Africa/Porto-Novo";
const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const MAX = 4000;

/**
 * Détail d'une demande d'assistance : en-tête (statut, priorité, catégorie), description, fil de messages animé
 * et zone de réponse. Vue administration : changement de statut et prise en charge.
 * Le texte est rendu tel quel (nœuds texte React, `whitespace-pre-wrap`) : aucun HTML n'est jamais interprété.
 */
export function DetailDemande({ id, admin = false }: { id: string; admin?: boolean }) {
  const { profil } = useSession();
  const q = useDemande(id);
  const repondre = useRepondreMutation(profil.nomAffiche);
  const statut = useStatutTicketMutation();
  const assignation = useAssignationMutation();
  const clore = useClore();
  const [texte, setTexte] = useState("");
  const fin = useRef<HTMLDivElement>(null);
  const nbMessages = q.data?.messages.length ?? 0;

  useEffect(() => { if (nbMessages) fin.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [nbMessages]);

  if (q.isPending) return <div className="space-y-3 p-1">{[0, 1, 2].map((i) => <Squelette key={i} className={cn("h-16", i === 1 ? "ml-auto w-3/4" : "w-3/4")} />)}</div>;
  if (q.isError) {
    return <EtatVide icone={RefreshCw} titre={q.error.message === "Demande introuvable" ? "Demande introuvable" : "Demande indisponible"} texte={q.error.message === "Demande introuvable" ? "Elle n'existe pas ou ne vous est pas accessible. La tentative a été journalisée." : q.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} />;
  }
  const { ticket, messages } = q.data;
  const clos = ticket.statut === "clos";
  const moiAssigne = ticket.assigneAMoi;

  const envoyer = (e?: FormEvent) => {
    e?.preventDefault();
    const contenu = texte.trim();
    if (!contenu || contenu.length > MAX || repondre.isPending) return;
    repondre.mutate({ id, contenu }, { onSuccess: () => setTexte("") });
  };
  const changerStatut = (s: StatutTicket) => statut.mutate({ id, statut: s }, { onSuccess: () => notifier({ ton: "succes", titre: `Demande ${LIBELLE_STATUT[s].toLowerCase()}`, texte: s === "resolu" ? "L'auteur en est notifié." : undefined }) });

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge ton={TON_STATUT[ticket.statut]}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />{LIBELLE_STATUT[ticket.statut]}</Badge>
          <Badge ton={TON_PRIORITE[ticket.priorite]}>Priorité {LIBELLE_PRIORITE[ticket.priorite].toLowerCase()}</Badge>
          <Badge>{LIBELLE_CATEGORIE[ticket.categorie]}</Badge>
          <span className="font-mono text-xs text-ink-muted">{ticket.id}</span>
        </div>
        <h3 className="break-words text-[17px] font-semibold leading-snug text-ink">{ticket.sujet}</h3>
        <p className="text-xs text-ink-muted">
          {admin ? <>Par <span className="font-medium text-ink-2">{ticket.auteurNom}</span> · <span className="font-mono">{ticket.auteurIdentifiant}</span> · {ticket.auteurFonction} · </> : null}
          ouverte le {quand(ticket.creeLe)}{ticket.assigneNom ? ` · prise en charge par ${ticket.assigneNom}` : ""}
        </p>
      </header>

      {admin && (
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-line/70 bg-surface-2/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-full overflow-x-auto">
            <Segmente label="Statut de la demande" valeur={ticket.statut} onChange={changerStatut}
              options={(["ouvert", "en_cours", "resolu", "clos"] as const).map((s) => ({ valeur: s, libelle: LIBELLE_STATUT[s] }))} />
          </div>
          <Button type="button" variante="secondaire" taille="sm" className="h-10 shrink-0" icone={ticket.assigneCompteId && moiAssigne ? UserMinus : UserCheck} chargement={assignation.isPending || statut.isPending}
            onClick={() => assignation.mutate({ id, assigner: !(ticket.assigneCompteId && moiAssigne) })}>
            {ticket.assigneCompteId && moiAssigne ? "Libérer" : ticket.assigneCompteId ? "Reprendre" : "Prendre en charge"}
          </Button>
        </div>
      )}

      <ol className="space-y-3" aria-label="Fil de la demande">
        <Bulle cote={admin ? "gauche" : "droite"} auteur={admin ? ticket.auteurNom : "Vous"} quand={quand(ticket.creeLe)} contenu={ticket.description} support={false} index={0} />
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <Bulle key={m.id} cote={m.deMoi ? "droite" : "gauche"} auteur={m.deMoi ? "Vous" : m.auteurNom} quand={quand(m.creeLe)} contenu={m.contenu} support={m.deLAdministration} index={i + 1} enAttente={m.id.startsWith("local-")} />
          ))}
        </AnimatePresence>
        <div ref={fin} />
      </ol>

      {clos ? (
        <p className="flex items-center gap-2 rounded-md bg-surface-2/70 px-3 py-2.5 text-sm text-ink-2"><ArchiveX size={16} aria-hidden /> Demande close. {admin ? "Rouvrez-la pour répondre." : "Ouvrez une nouvelle demande si le problème persiste."}</p>
      ) : (
        <form onSubmit={envoyer} className="space-y-2">
          <label htmlFor={`reponse-${id}`} className="sr-only">Votre réponse</label>
          <textarea
            id={`reponse-${id}`} rows={3} maxLength={MAX} value={texte} onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) envoyer(); }}
            placeholder={admin ? "Répondre à l'auteur (il sera notifié)…" : "Ajouter une précision ou répondre…"}
            className="w-full resize-y rounded-md border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className={cn("text-xs tabular-nums", texte.length > MAX * 0.9 ? "text-warning" : "text-ink-muted")}>{texte.length} / {MAX} · Ctrl + Entrée pour envoyer</span>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {!admin && (
                <Button type="button" variante="fantome" icone={CheckCircle2} chargement={clore.isPending} onClick={() => clore.mutate(id, { onSuccess: () => notifier({ ton: "succes", titre: "Demande close", texte: "Merci : elle reste consultable dans votre historique." }) })}>
                  Problème réglé, clore
                </Button>
              )}
              <Button type="submit" icone={Send} chargement={repondre.isPending} disabled={!texte.trim()}>Envoyer</Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function Bulle({ cote, auteur, quand, contenu, support, index, enAttente }: { cote: "gauche" | "droite"; auteur: string; quand: string; contenu: string; support: boolean; index: number; enAttente?: boolean }) {
  const droite = cote === "droite";
  return (
    <motion.li layout initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.32, ease: EASE, delay: Math.min(index, 12) * 0.035 }}
      className={cn("flex min-w-0", droite ? "justify-end" : "justify-start")}>
      <div className={cn("min-w-0 max-w-[92%] rounded-2xl px-3.5 py-2.5 sm:max-w-[80%]", droite ? "rounded-br-md bg-blue-soft text-ink" : "rounded-bl-md border border-line/70 bg-surface text-ink")}>
        <p className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          <span className="font-semibold text-ink">{auteur}</span>
          {support && <Badge ton="marque" icone={Headset}>Support</Badge>}
          <span className="text-ink-muted">{quand}</span>
          {enAttente && <Loader2 size={12} className="animate-spin text-ink-muted" aria-label="Envoi en cours" />}
        </p>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{contenu}</p>
      </div>
    </motion.li>
  );
}
