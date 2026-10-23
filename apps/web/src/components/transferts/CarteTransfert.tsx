"use client";

import { ArrowRight, Check, Gavel, Undo2, X } from "lucide-react";
import { useState } from "react";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, type Ton } from "@/components/ui/primitives";
import { classeChamp, classeSelect, dateCourte, Dialogue } from "@/app/(gestion)/etablissement/_composants";
import { useActionTransfert, type EtatTransfert, type Transfert } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";

export const LIBELLE_ETAT: Record<EtatTransfert, [string, Ton]> = {
  en_attente: ["En attente", "info"], expiree: ["Expirée", "avertissement"], acceptee: ["Acceptée", "succes"],
  refusee: ["Refusée", "critique"], retiree: ["Retirée", "neutre"],
};

type Mode = "accepter" | "refuser" | "retirer" | "imposer";
const MODES: Record<Mode, { titre: string; bouton: string; action: "decision" | "retrait" | "imposer"; classe: boolean; motifRequis: boolean; ton: "neutre" | "danger" | "succes" }> = {
  accepter: { titre: "Accepter le transfert", bouton: "Accepter", action: "decision", classe: true, motifRequis: false, ton: "succes" },
  refuser: { titre: "Refuser le transfert", bouton: "Refuser", action: "decision", classe: false, motifRequis: true, ton: "danger" },
  retirer: { titre: "Retirer la demande", bouton: "Retirer la demande", action: "retrait", classe: false, motifRequis: true, ton: "neutre" },
  imposer: { titre: "Décider le transfert (inspection)", bouton: "Décider le transfert", action: "imposer", classe: true, motifRequis: true, ton: "neutre" },
};

/** Une demande de transfert : qui, d'où, vers où, pourquoi, où elle en est, et les actions que le serveur autorise. */
export function CarteTransfert({ t, sens }: { t: Transfert; sens: "entrant" | "sortant" | "inspection" }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [libelle, ton] = LIBELLE_ETAT[t.etat];
  return (
    <li className="rounded-lg border border-line/70 bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{t.eleve.prenoms} <span className="uppercase">{t.eleve.nom}</span> <span className="font-normal text-ink-muted">· {t.niveau}</span></p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2">
            <span>{t.de.nom}</span><ArrowRight size={13} aria-label="vers" /><span>{t.vers.nom}</span>
            <span className="text-ink-muted">· classe proposée : {t.classeProposee.libelle}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {t.impose && <Badge ton="marque">Décidé par l&apos;inspection</Badge>}
          <Badge ton={ton}>{libelle}</Badge>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink-2"><span className="text-ink-muted">Motif de la demande :</span> {t.motif}</p>
      <p className="mt-1 text-xs text-ink-muted">
        Demandée le {dateCourte(t.creeeLe)}{t.etat === "en_attente" && t.echeance ? ` · réponse attendue avant le ${dateCourte(t.echeance)}` : ""}
        {t.reponse?.motif && t.etat !== "en_attente" ? ` · ${t.reponse.motif}` : ""}
      </p>
      {(t.peutDecider || t.peutRetirer || t.peutImposer) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {t.peutDecider && <Button taille="sm" variante="primaire" icone={Check} onClick={() => setMode("accepter")}>Accepter</Button>}
          {t.peutDecider && <Button taille="sm" variante="secondaire" icone={X} onClick={() => setMode("refuser")}>Refuser</Button>}
          {t.peutRetirer && sens !== "inspection" && <Button taille="sm" variante="secondaire" icone={Undo2} onClick={() => setMode("retirer")}>Retirer la demande</Button>}
          {t.peutImposer && <Button taille="sm" variante="secondaire" icone={Gavel} onClick={() => setMode("imposer")}>Décider le transfert</Button>}
        </div>
      )}
      {mode && <DialogueAction t={t} mode={mode} fermer={() => setMode(null)} />}
    </li>
  );
}

function DialogueAction({ t, mode, fermer }: { t: Transfert; mode: Mode; fermer: () => void }) {
  const m = MODES[mode];
  const premiereLibre = t.classesPossibles.find((c) => c.id === t.classeProposee.id && c.places > 0) ?? t.classesPossibles.find((c) => c.places > 0);
  const [classe, setClasse] = useState(premiereLibre?.id ?? "");
  const [motif, setMotif] = useState("");
  const action = useActionTransfert();
  const n = motif.trim().length;
  const pret = (!m.classe || !!classe) && (m.motifRequis ? n >= 10 : true);
  const valider = () => action.mutate({
    demandeId: t.id, action: m.action,
    corps: mode === "accepter" ? { decision: "accepte", versClasseId: classe, ...(n ? { motif: motif.trim() } : {}) }
      : mode === "refuser" ? { decision: "refuse", motif: motif.trim() }
      : mode === "imposer" ? { versClasseId: classe, motif: motif.trim() }
      : { motif: motif.trim() },
  }, {
    onSuccess: (r) => {
      const qui = `${t.eleve.prenoms} ${t.eleve.nom}`;
      const titre = { accepter: "Transfert accepté", refuser: "Transfert refusé", retirer: "Demande retirée", imposer: "Transfert décidé" }[mode];
      notifier({ ton: "succes", titre, texte:
        mode === "refuser" ? `Refus enregistré ; l'école de départ et la famille sont informées.`
        : mode === "retirer" ? `Demande retirée : ${qui} reste dans son école.`
        : `${qui} rejoint ${t.vers.nom}${r.classe ? ` (${r.classe})` : ""}. Son dossier le suit, sans ressaisie.` });
      fermer();
    },
  });
  return (
    <Dialogue ouvert onFermer={() => { if (!action.isPending) fermer(); }} ton={m.ton} titre={m.titre}
      description={`${t.eleve.prenoms} ${t.eleve.nom} · ${t.niveau} · ${t.de.nom} → ${t.vers.nom}`}
      pied={<>
        <Button variante="secondaire" onClick={fermer} disabled={action.isPending}>Annuler</Button>
        <Button variante={mode === "refuser" ? "danger" : "primaire"} disabled={!pret} chargement={action.isPending} onClick={valider}>{m.bouton}</Button>
      </>}>
      <div className="space-y-4">
        {m.classe && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Classe d&apos;accueil</span>
            {t.classesPossibles.length ? (
              <select value={classe} onChange={(e) => setClasse(e.target.value)} className={cn(classeSelect, "w-full")}>
                {t.classesPossibles.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.places <= 0}>{c.libelle} — {c.effectif}/{c.capacite} élèves{c.places <= 0 ? " (complète)" : ""}{c.id === t.classeProposee.id ? " · proposée" : ""}</option>
                ))}
              </select>
            ) : <p className="text-[13px] text-critical">Aucune classe de {t.niveau} pour l&apos;année {t.anneeScolaire} dans l&apos;établissement d&apos;accueil.</p>}
            {!premiereLibre && t.classesPossibles.length > 0 && <p className="mt-1 text-xs text-critical">Toutes les classes de {t.niveau} sont complètes.</p>}
          </label>
        )}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">{m.motifRequis ? "Motif (obligatoire)" : "Message (facultatif)"}</span>
          <textarea value={motif} onChange={(e) => setMotif(e.target.value.slice(0, 200))} rows={2} className={cn(classeChamp, "h-auto py-2.5")}
            placeholder={mode === "refuser" ? "Ex. : classes de 5e complètes jusqu'à la fin du trimestre" : mode === "retirer" ? "Ex. : la famille renonce au déménagement" : mode === "imposer" ? "Ex. : affectation décidée après examen de la situation familiale" : "Ex. : accueil prévu lundi à 7 h 30"} />
          {m.motifRequis && <span className={cn("mt-1 block text-xs", motif && n < 10 ? "text-critical" : "text-ink-muted")}>{motif && n < 10 ? "Au moins 10 caractères." : `${n}/200 caractères`}</span>}
        </label>
        {action.error instanceof ErreurApi && <p role="alert" className="text-xs text-critical">{action.error.message}</p>}
      </div>
    </Dialogue>
  );
}
