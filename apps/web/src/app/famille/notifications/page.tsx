"use client";

import { Award, BellOff, BellRing, CalendarX2, CheckCheck, NotebookPen, PencilLine, RefreshCw, School, ArrowRightLeft, type LucideIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AnimatePresence, EASE, EntreePage, motion } from "@/components/motion";
import { CLE_NOTIFICATIONS, useMarquerLues, useNotifications, type NotificationServeur } from "@/components/shell/Cloche";
import { Button, Card, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";

type Donnees = { nonLues: number; notifications: NotificationServeur[] };

/** Icône selon le fait d'origine (le titre est produit par le serveur à partir du type d'événement). */
function nature(titre: string): { icone: LucideIcon; ton: string } {
  if (titre.startsWith("Absence")) return { icone: CalendarX2, ton: "bg-warning-bg text-warning" };
  if (titre.startsWith("Nouvelle note")) return { icone: NotebookPen, ton: "bg-info-bg text-info" };
  if (titre.startsWith("Note corrigée")) return { icone: PencilLine, ton: "bg-info-bg text-info" };
  if (titre.startsWith("Diplôme")) return { icone: Award, ton: "bg-success-bg text-success" };
  if (titre.startsWith("Transfert")) return { icone: ArrowRightLeft, ton: "bg-surface-2 text-ink-2" };
  if (titre.startsWith("Inscription")) return { icone: School, ton: "bg-success-bg text-success" };
  return { icone: BellRing, ton: "bg-surface-2 text-ink-2" };
}

const depuis = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
const jourDe = (iso: string) => new Date(iso).toLocaleDateString("fr-CA");
function libelleJour(iso: string) {
  const j = jourDe(iso);
  const auj = new Date();
  const hier = new Date(auj.getTime() - 86_400_000);
  if (j === jourDe(auj.toISOString())) return "Aujourd'hui";
  if (j === jourDe(hier.toISOString())) return "Hier";
  return new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export default function Notifications() {
  const q = useNotifications();
  const marquer = useMarquerLues();
  const client = useQueryClient();
  const [filtre, setFiltre] = useState<"toutes" | "non_lues">("toutes");

  const liste = useMemo(() => (q.data?.notifications ?? []).filter((n) => filtre === "toutes" || !n.lue), [q.data, filtre]);
  const groupes = useMemo(() => {
    const m = new Map<string, NotificationServeur[]>();
    for (const n of liste) { const k = jourDe(n.creeLe); m.set(k, [...(m.get(k) ?? []), n]); }
    return [...m.values()];
  }, [liste]);
  const nonLues = q.data?.nonLues ?? 0;

  /** Mise à jour optimiste : la pastille disparaît immédiatement, le serveur confirme ensuite. */
  const lire = (ids?: string[]) => {
    const avant = client.getQueryData<Donnees>(CLE_NOTIFICATIONS);
    if (avant) {
      const cible = (n: NotificationServeur) => !ids || ids.includes(n.id);
      const notifications = avant.notifications.map((n) => (cible(n) ? { ...n, lue: true } : n));
      client.setQueryData<Donnees>(CLE_NOTIFICATIONS, { notifications, nonLues: notifications.filter((n) => !n.lue).length });
    }
    marquer.mutate(ids, { onError: () => avant && client.setQueryData(CLE_NOTIFICATIONS, avant) });
  };

  return (
    <EntreePage>
    <div className="space-y-5">
      <PageHeader
        titre="Notifications"
        sousTitre="Elles naissent des faits enregistrés par l'établissement : aucune n'est rédigée à la main."
        actions={nonLues > 0 ? <Button data-guide="notifications-tout-lire" variante="secondaire" icone={CheckCheck} onClick={() => lire()}>Tout marquer comme lu</Button> : undefined}
      />

      <div data-guide="notifications-filtre" className="flex items-center justify-between gap-3">
        <Segmente label="Filtrer" valeur={filtre} onChange={setFiltre} options={[{ valeur: "toutes", libelle: "Toutes" }, { valeur: "non_lues", libelle: `Non lues${nonLues ? ` (${nonLues})` : ""}` }]} />
        {q.isFetching && !q.isPending && <RefreshCw size={14} className="animate-spin text-ink-muted" aria-label="Actualisation" />}
      </div>

      {q.isPending ? (
        <Card className="space-y-4 p-4" aria-busy>{[0, 1, 2, 3].map((i) => <div key={i} className="flex gap-3"><Squelette className="h-10 w-10" /><div className="flex-1 space-y-2"><Squelette className="h-4 w-2/3" /><Squelette className="h-3.5 w-full" /></div></div>)}</Card>
      ) : q.isError ? (
        <Card><EtatVide icone={RefreshCw} titre="Notifications indisponibles" texte={`${q.error.message}. Réessayez dans un instant.`} action={<Button variante="secondaire" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>} /></Card>
      ) : liste.length === 0 ? (
        <Card>
          <EtatVide icone={BellOff} titre={filtre === "non_lues" ? "Tout est lu" : "Aucune notification"} texte={filtre === "non_lues" ? "Vous êtes à jour. Les nouvelles notifications apparaîtront ici." : "Quand un enseignant fait l'appel ou saisit une note, la notification arrive ici — ou dès la synchronisation si l'établissement était hors connexion."} />
        </Card>
      ) : (
        <div className="space-y-5">
          {groupes.map((g) => (
            <section key={jourDe(g[0]!.creeLe)}>
              <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted first-letter:uppercase">{libelleJour(g[0]!.creeLe)}</h2>
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-line">
                  <AnimatePresence initial={false}>
                    {g.map((n, i) => {
                      const { icone: Icone, ton } = nature(n.titre);
                      return (
                        <motion.li key={n.id} layout initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4, delay: Math.min(i, 12) * 0.035, ease: EASE }}>
                          <button onClick={() => !n.lue && lire([n.id])} disabled={n.lue} aria-label={n.lue ? undefined : `${n.titre} — marquer comme lue`}
                            className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors sm:px-5", !n.lue ? "bg-[var(--acc-doux)]/50 hover:bg-[var(--acc-doux)]" : "cursor-default")}>
                            <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md", ton)}><Icone size={17} aria-hidden /></span>
                            <div className="min-w-0 flex-1">
                              <p className={cn("flex items-center gap-2 text-sm text-ink", !n.lue ? "font-semibold" : "font-medium")}>
                                <AnimatePresence initial={false}>
                                  {!n.lue && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--acc)" }} aria-hidden />}
                                </AnimatePresence>
                                <span className="min-w-0">{n.titre}</span>
                              </p>
                              <p className="mt-0.5 text-[13px] leading-snug text-ink-2">{n.texte}</p>
                            </div>
                            <span className="shrink-0 pt-0.5 text-xs tabular-nums text-ink-muted">{depuis(n.creeLe)}</span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
    </EntreePage>
  );
}
