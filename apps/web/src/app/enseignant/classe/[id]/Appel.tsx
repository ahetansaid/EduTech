"use client";

import { Check, CloudOff, RotateCcw, Search, Send, UserX } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { useEnLigne } from "@/components/shell/EtatReseau";
import { Card } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { dateLongue } from "@/lib/format";
import { useAppelMutation, type Carnet, type CorpsAppel } from "@/lib/api/enseignant";
import { useFileHorsConnexion } from "@/lib/fileHorsConnexion";
import { BadgePoint, BarreAction, Confirmation, initiales, LIBELLE_STATUT, TON_STATUT, type StatutEleve } from "../../communs";

const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Appel du jour, pensé pour le pouce : un toucher marque absent (un second annule), le compteur suit,
 * une validation envoie tout d'un geste. Hors connexion, l'appel part dans la file de l'appareil.
 * Les absences déjà enregistrées aujourd'hui sont verrouillées (jamais envoyées deux fois).
 */
export function Appel({ carnet }: { carnet: Carnet }) {
  const classeId = carnet.classe.id;
  const enLigne = useEnLigne();
  const file = useFileHorsConnexion(classeId);
  const mutation = useAppelMutation(classeId, carnet.classe.libelle);
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  const [confirmation, setConfirmation] = useState<{ attente: boolean; n: number } | null>(null);
  const fermer = useCallback(() => setConfirmation(null), []);

  // Absents du jour encore dans la file de l'appareil (non synchronisés).
  const enAttente = useMemo(() => new Set(file.filter((s) => s.type === "appel" && (s.corps as unknown as CorpsAppel).date === carnet.date)
    .flatMap((s) => (s.corps as unknown as CorpsAppel).apprenantIds)), [file, carnet.date]);

  const statut = (id: string, absentAujourdhui: boolean): StatutEleve =>
    enAttente.has(id) ? "attente" : absentAujourdhui ? "enregistre" : absents.has(id) ? "absent" : "present";

  const dejaAbsents = carnet.eleves.filter((e) => e.absentAujourdhui || enAttente.has(e.id)).length;
  const totalAbsents = dejaAbsents + absents.size;
  const presents = carnet.eleves.length - totalAbsents;
  const filtre = sansAccents(recherche.trim());
  const visibles = filtre ? carnet.eleves.filter((e) => sansAccents(`${e.nom} ${e.prenoms}`).includes(filtre)) : carnet.eleves;

  const basculer = (id: string) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(8);
    setAbsents((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const valider = () => {
    const ids = [...absents];
    if (!ids.length) return;
    mutation.mutate({ classeId, date: carnet.date, apprenantIds: ids }, {
      onSuccess: (r) => { setAbsents(new Set()); setConfirmation({ attente: r.etat === "en_attente", n: ids.length }); },
    });
  };

  if (carnet.lecture) {
    return <Card><p className="text-[14px] text-ink-2">Consultation seule : l'appel est réservé aux enseignants de la classe.</p></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Compteur collant */}
      <div className="rounded-xl border border-line/70 bg-surface p-3 shadow-float sm:p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] text-ink-muted">Appel du {dateLongue(carnet.date)}</p>
            <p className="mt-0.5 flex items-baseline gap-3 text-[14px]">
              <span><Chiffre valeur={presents} className="text-success" /> <span className="text-ink-2">présents</span></span>
              <span><Chiffre valeur={totalAbsents} className="text-critical" /> <span className="text-ink-2">absents</span></span>
            </p>
          </div>
          {absents.size > 0 && (
            <button onClick={() => setAbsents(new Set())} className="flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium text-ink-muted hover:bg-surface-2 hover:text-ink">
              <RotateCcw size={15} aria-hidden /> <span className="hidden sm:inline">Tout présent</span>
            </button>
          )}
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
          <motion.div className="h-full bg-success" animate={{ width: `${(presents / Math.max(1, carnet.eleves.length)) * 100}%` }} transition={{ type: "spring", stiffness: 260, damping: 30 }} />
          <motion.div className="h-full bg-critical" animate={{ width: `${(totalAbsents / Math.max(1, carnet.eleves.length)) * 100}%` }} transition={{ type: "spring", stiffness: 260, damping: 30 }} />
        </div>
      </div>

      {/* Recherche */}
      <label className="relative block">
        <span className="sr-only">Rechercher un élève</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={recherche} onChange={(e) => setRecherche(e.target.value.slice(0, 40))} placeholder="Rechercher un élève…" enterKeyHint="search"
          className="h-11 w-full rounded-lg border border-line bg-surface pl-10 pr-3.5 text-[15px] text-ink outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/15" />
      </label>

      {/* Liste : un toucher = absent */}
      {visibles.length === 0 ? (
        <p className="rounded-lg bg-surface-2/60 px-4 py-6 text-center text-[14px] text-ink-muted">Aucun élève ne correspond à « {recherche} ».</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label="Liste d'appel">
          {visibles.map((e, i) => {
            const s = statut(e.id, e.absentAujourdhui);
            const verrouille = s === "enregistre" || s === "attente";
            const absent = s !== "present";
            return (
              <motion.li key={e.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035, duration: 0.3 }}>
                <motion.button
                  type="button"
                  whileTap={verrouille ? undefined : { scale: 0.97 }}
                  onClick={() => !verrouille && basculer(e.id)}
                  aria-pressed={absent}
                  aria-disabled={verrouille}
                  aria-label={`${e.nom} ${e.prenoms} : ${LIBELLE_STATUT[s]}${verrouille ? "" : ". Toucher pour changer"}`}
                  className={cn(
                    "flex min-h-[60px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-200",
                    s === "absent" ? "border-critical/40 bg-critical-bg" : verrouille ? "cursor-default border-line/60 bg-surface-2/60" : "border-line/70 bg-surface hover:border-line",
                  )}
                >
                  <motion.span
                    layout
                    className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors duration-200",
                      s === "absent" ? "bg-critical text-white" : s === "attente" ? "bg-warning text-white" : s === "enregistre" ? "bg-ink-muted/20 text-ink-2" : "bg-success-bg text-success")}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={s} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.16 }}>
                        {s === "absent" ? <UserX size={18} aria-hidden /> : s === "attente" ? <CloudOff size={17} aria-hidden /> : initiales(e)}
                      </motion.span>
                    </AnimatePresence>
                  </motion.span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-ink">{e.nom}</span>
                    <span className="block truncate text-[13px] text-ink-2">{e.prenoms}{e.besoinsParticuliers ? " · besoins particuliers" : ""}</span>
                  </span>
                  <BadgePoint ton={TON_STATUT[s]} className={cn(s === "present" && "opacity-70")}>{s === "present" ? <><Check size={12} aria-hidden className="-ml-0.5" />Présent</> : LIBELLE_STATUT[s].replace("Absent · ", "")}</BadgePoint>
                </motion.button>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Validation en un geste — barre fixée au-dessus des onglets du téléphone */}
      <BarreAction>
        <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5 text-[12.5px]">
          <span><Chiffre valeur={presents} className="text-success" /> <span className="text-ink-2">présents</span></span>
          <span className="text-ink-muted">{carnet.eleves.length} élèves</span>
          <span><Chiffre valeur={totalAbsents} className="text-critical" /> <span className="text-ink-2">absents</span></span>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          disabled={!absents.size || mutation.isPending}
          onClick={valider}
          className={cn(
            "flex h-14 w-full items-center justify-center gap-2.5 rounded-xl px-4 text-[15.5px] font-semibold transition-colors",
            absents.size ? "text-white shadow-sm" : "cursor-not-allowed bg-surface-2 text-ink-muted",
          )}
          style={absents.size ? { background: enLigne ? "var(--acc)" : "var(--warning)" } : undefined}
        >
          {mutation.isPending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : enLigne ? <Send size={18} aria-hidden /> : <CloudOff size={18} aria-hidden />}
          {absents.size
            ? <>Valider · <Chiffre valeur={absents.size} /> absent{absents.size > 1 ? "s" : ""}{!enLigne && " (hors ligne)"}</>
            : dejaAbsents ? "Touchez un élève pour ajouter" : "Touchez les élèves absents"}
        </motion.button>
      </BarreAction>

      <Confirmation
        visible={!!confirmation}
        attente={confirmation?.attente}
        titre={confirmation?.attente ? "Appel conservé" : "Appel enregistré"}
        texte={confirmation ? (confirmation.attente
          ? `${confirmation.n} absence${confirmation.n > 1 ? "s" : ""} sur l'appareil · envoi automatique au retour du réseau.`
          : `${confirmation.n} absence${confirmation.n > 1 ? "s" : ""} au registre · les familles sont notifiées.`) : undefined}
        fermer={fermer}
      />
    </div>
  );
}

/** Chiffre qui « saute » quand il change. */
function Chiffre({ valeur, className }: { valeur: number; className?: string }) {
  return (
    <span className="inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={valeur} initial={{ y: "-60%", opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: "60%", opacity: 0 }} transition={{ duration: 0.2 }} className={cn("font-bold tabular-nums", className)}>
          {valeur}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
