"use client";

import { Check, Gavel, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Button, Squelette } from "@/components/ui/primitives";
import { useDecisionDemandeMutation, useDemandeDetail } from "@/lib/api/etablissement";
import { CIRCUIT_LIBELLE, LIBELLE_ROLE_CIRCUIT, libelleEtape } from "@/lib/circuits";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";

/**
 * Dialogue de décision sur une demande en circuit (partagé : espace établissement et file « demandes à traiter »).
 * Charge le détail (étapes, décisions rendues, droit d'agir), puis valide / renvoie / refuse l'étape courante.
 * Le droit d'agir est décidé par l'API : ici on ne fait que l'afficher.
 */
export function DialogueStatuer({ demandeId, onFermer }: { demandeId: string | null; onFermer: () => void }) {
  const detail = useDemandeDetail(demandeId);
  const decision = useDecisionDemandeMutation();
  const [sens, setSens] = useState<"valide" | "refuse" | "renvoye" | null>(null);
  const [motif, setMotif] = useState("");
  const d = detail.data;
  const erreur = decision.error instanceof ErreurApi ? decision.error : null;
  const motifRequis = sens === "refuse" || sens === "renvoye";
  const motifValide = !motifRequis || motif.trim().length >= 5;
  const role = d?.etapeCourante ? (LIBELLE_ROLE_CIRCUIT[d.etapeCourante.role] ?? d.etapeCourante.role) : null;

  const fermer = () => { setSens(null); setMotif(""); onFermer(); };

  const envoyer = () => {
    if (!demandeId || !sens) return;
    decision.mutate({ demandeId, decision: sens, ...(motifRequis ? { motif: motif.trim() } : {}) }, {
      onSuccess: () => { notifier({ ton: "succes", titre: "Décision enregistrée", texte: "La demande a avancé dans le circuit et le demandeur est notifié." }); fermer(); },
      onError: (e) => { if (e instanceof ErreurApi && e.statut === 409) fermer(); },
    });
  };

  const ton = sens === "refuse" ? "critique" : sens === "valide" ? "succes" : "info";
  return (
    <Modale
      ouvert={!!demandeId}
      onFermer={fermer}
      ton={ton}
      icone={sens === "refuse" ? X : sens === "valide" ? Check : Gavel}
      titre="Statuer sur la demande"
      sousTitre={d ? `${CIRCUIT_LIBELLE[d.modele.code] ?? d.modele.libelle} · étape « ${d.etapeCourante ? libelleEtape(d.modele.code, d.etapeCourante.code) : "—" } »` : undefined}
      pied={d?.peutStatuer && sens ? (
        <>
          <Button variante="secondaire" onClick={() => setSens(null)} disabled={decision.isPending}>Retour</Button>
          <Button variante={sens === "refuse" ? "danger" : "valider"} icone={sens === "refuse" ? X : Check} disabled={!motifValide} chargement={decision.isPending} onClick={envoyer}>Confirmer</Button>
        </>
      ) : undefined}
    >
      {detail.isPending ? (
        <div className="space-y-2"><Squelette className="h-16" /><Squelette className="h-10" /></div>
      ) : detail.isError ? (
        <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{detail.error instanceof ErreurApi ? detail.error.message : "Chargement impossible."}</p>
      ) : d ? (
        <div className="space-y-4">
          <div className="rounded-md bg-surface-2/70 px-3 py-2 text-[13px] text-ink-2">
            <p className="font-medium text-ink">{d.demande.objet}</p>
            <p className="mt-0.5 text-xs text-ink-muted">Demandeur : {d.demande.demandeur ?? "—"}{d.demande.etablissement ? ` · ${d.demande.etablissement}` : ""}</p>
          </div>
          <ol className="space-y-1">
            {d.modele.etapes.map((e) => (
              <li key={e.code} className={cn("flex items-center gap-2 text-[13px]", e.code === d.etapeCourante?.code ? "font-semibold text-ink" : "text-ink-muted")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", e.code === d.etapeCourante?.code ? "bg-warning" : "bg-ink-muted/40")} aria-hidden />
                {libelleEtape(d.modele.code, e.code)}
                <span className="text-xs">· {LIBELLE_ROLE_CIRCUIT[e.role] ?? e.role}</span>
              </li>
            ))}
          </ol>
          {d.decisions.length > 0 && (
            <ul className="space-y-1 border-t border-line/60 pt-2">
              {d.decisions.map((dec) => (
                <li key={dec.id} className="text-xs text-ink-muted">{new Date(dec.horodatage).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })} · {dec.etape} — {dec.decision === "valide" ? "validée" : dec.decision === "refuse" ? "refusée" : "renvoyée"}{dec.motif ? ` (${dec.motif})` : ""}</li>
              ))}
            </ul>
          )}
          {!d.peutStatuer ? (
            <p className="rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Cette étape relève {role ? `du rôle « ${role} »` : "d'un autre rôle"} : vous pouvez la consulter, mais pas statuer dessus.</p>
          ) : !sens ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variante="valider" icone={Check} onClick={() => setSens("valide")}>Valider</Button>
              <Button variante="secondaire" icone={RotateCcw} onClick={() => setSens("renvoye")}>Renvoyer</Button>
              <Button variante="danger" icone={X} onClick={() => setSens("refuse")}>Refuser</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {d.modele.code === "RELANCE_TRANSMISSION" && sens === "valide" && (
                <p className="rounded-md bg-warning-bg px-3 py-2 text-[13px] text-warning">En validant la transmission, vous attestez que la remontée de l'établissement a été effectuée : il ne sera plus relancé pour cette année.</p>
              )}
              {motifRequis && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Motif <span className="text-critical">*</span></span>
                  <textarea value={motif} onChange={(ev) => setMotif(ev.target.value.slice(0, 200))} rows={3} placeholder={sens === "refuse" ? "Expliquez le refus (transmis au demandeur)." : "Précisez ce qui doit être corrigé (transmis au demandeur)."} className="h-auto w-full rounded-md border border-line bg-surface px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15" aria-invalid={!!motif && !motifValide} />
                  <span className="mt-1 block text-xs text-ink-muted">{motif.trim().length}/200 · 5 caractères minimum</span>
                </label>
              )}
            </div>
          )}
          {erreur && erreur.statut !== 409 && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur.message}</p>}
          {erreur?.statut === 409 && <p role="status" className="rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Cette demande est déjà close ou l'étape a changé : l'écran vient d'être actualisé.</p>}
        </div>
      ) : null}
    </Modale>
  );
}
