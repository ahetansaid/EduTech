"use client";

import { AlertTriangle, LockOpen, MonitorSmartphone, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, EtatVide, Squelette } from "@/components/ui/primitives";
import { useDetailCompte, useDeverrouillerMutation, useFicheNpi, useModifierProfilMutation, useRevoquerSessionsMutation, type DetailCompte } from "@/lib/api/administration";
import type { CompteAdmin } from "@/lib/api/gouvernance";
import { entier } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { depuisHabilitations, EditeurHabilitations, validerTout, type Brouillon } from "./EditeurHabilitations";
import { Champ, CHAMP, dateHeure, heure } from "./communs";

/**
 * Gestion d'un compte depuis la liste : identité, habilitations (les sessions ouvertes sont révoquées pour que
 * les nouveaux droits prennent effet), révocation des sessions, déverrouillage. Feuille basse sur mobile.
 */
export function EditionCompte({ compte, moi, onFermer }: { compte: CompteAdmin | null; moi: boolean; onFermer: () => void }) {
  const detail = useDetailCompte(compte?.id ?? null);
  return (
    <Modale ouvert={!!compte} onFermer={onFermer} large titre={compte ? `Gérer · ${compte.nomAffiche}` : "Gérer le compte"} sousTitre={compte?.identifiant} icone={UserCog}>
      {detail.isPending ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Squelette key={i} className="h-20 w-full" />)}</div>
      ) : detail.isError ? (
        <EtatVide icone={RefreshCw} titre="Compte indisponible" texte={detail.error.message} action={<Button variante="secondaire" taille="sm" icone={RefreshCw} onClick={() => detail.refetch()}>Réessayer</Button>} />
      ) : (
        // Clé : le formulaire repart des données serveur à chaque changement de compte (pas à chaque relecture).
        <Formulaire key={detail.data.compte.id} d={detail.data} maintenant={detail.dataUpdatedAt} moi={moi} onFermer={onFermer} />
      )}
    </Modale>
  );
}

function Formulaire({ d, maintenant, moi, onFermer }: { d: DetailCompte; maintenant: number; moi: boolean; onFermer: () => void }) {
  const [nom, setNom] = useState(d.profil.nomAffiche);
  const [fonction, setFonction] = useState(d.profil.fonction);
  const [npi, setNpi] = useState(d.profil.npi ?? "");
  const [brouillons, setBrouillons] = useState<Brouillon[]>(() => depuisHabilitations(d.profil.habilitations, d.libelles));
  const [tente, setTente] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const modifier = useModifierProfilMutation();
  const revoquer = useRevoquerSessionsMutation();
  const deverrouiller = useDeverrouillerMutation();

  const npiValide = /^\d{10}$/.test(npi);
  const fiche = useFicheNpi(npi);
  const npiRetenu = npiValide ? npi : null;
  const v = validerTout(brouillons, npiRetenu, fiche.data);
  const droitsModifies = JSON.stringify(v.habilitations) !== JSON.stringify(d.profil.habilitations) || v.habilitations.length !== brouillons.length;
  const npiModifie = npiRetenu !== d.profil.npi;
  const modifie = droitsModifies || npiModifie || nom.trim() !== d.profil.nomAffiche || fonction.trim() !== d.profil.fonction;
  const perteAdmin = moi && !v.habilitations.some((h) => h.role === "administrateur");
  const erreurNpi = npi && !npiValide ? "Le NPI comporte exactement 10 chiffres." : npiModifie && npiValide && fiche.data && !fiche.data.personne ? "NPI inconnu du registre national." : npiModifie && fiche.data?.profilExistant && fiche.data.profilExistant.id !== d.profil.id ? `Déjà rattaché à ${fiche.data.profilExistant.nomAffiche}.` : null;
  const verrouille = !!d.compte.verrouilleJusquA && Date.parse(d.compte.verrouilleJusquA) > maintenant;

  const enregistrer = async () => {
    setTente(true);
    setErreur(null);
    if (!v.valide || erreurNpi || nom.trim().length < 3 || fonction.trim().length < 3 || perteAdmin) return;
    try {
      const r = await modifier.mutateAsync({
        id: d.compte.id,
        ...(nom.trim() !== d.profil.nomAffiche ? { nomAffiche: nom.trim() } : {}),
        ...(fonction.trim() !== d.profil.fonction ? { fonction: fonction.trim() } : {}),
        ...(npiModifie ? { npi: npiRetenu } : {}),
        ...(droitsModifies ? { habilitations: v.habilitations } : {}),
      });
      notifier({ ton: "succes", titre: "Compte mis à jour", texte: r.sessionsRevoquees ? `${entier(r.sessionsRevoquees)} session(s) révoquée(s) : les nouveaux droits s'appliquent à la prochaine connexion.` : undefined });
      onFermer();
    } catch (e) {
      setErreur(e instanceof ErreurApi ? e.message : "Enregistrement impossible.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Identité</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="ed-nom" libelle="Nom affiché" erreur={tente && nom.trim().length < 3 ? "3 caractères au moins." : null}><input id="ed-nom" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} className={CHAMP} /></Champ>
          <Champ id="ed-fonction" libelle="Fonction" erreur={tente && fonction.trim().length < 3 ? "3 caractères au moins." : null}><input id="ed-fonction" maxLength={120} value={fonction} onChange={(e) => setFonction(e.target.value)} className={CHAMP} /></Champ>
          <Champ id="ed-npi" libelle="NPI" facultatif erreur={erreurNpi}><input id="ed-npi" inputMode="numeric" maxLength={10} value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g, "").slice(0, 10))} className={`${CHAMP} font-mono tracking-wider`} /></Champ>
          <div className="min-w-0 rounded-md bg-surface-2/60 px-3 py-2.5 text-xs text-ink-2 sm:mt-7 sm:self-start">
            Créé le {dateHeure(d.compte.creeLe)} · {d.compte.derniereConnexion ? `dernière connexion ${dateHeure(d.compte.derniereConnexion)}` : "jamais connecté"}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Habilitations</h3>
        <EditeurHabilitations valeur={brouillons} onChange={setBrouillons} npi={npiRetenu} fiche={fiche.data} erreurs={tente ? v.erreurs : {}} verrouAdmin={moi} />
        <AnimatePresence>
          {(droitsModifies || npiModifie) && d.sessions.length > 0 && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-[13px] text-ink">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              {moi ? "Vos autres sessions seront révoquées ; celle-ci est conservée." : `${d.sessions.length} session(s) ouverte(s) seront révoquées pour que les nouveaux droits s'appliquent.`}
            </motion.p>
          )}
        </AnimatePresence>
        {perteAdmin && <p className="text-xs text-critical" role="alert">Vous ne pouvez pas retirer votre propre rôle d'administrateur.</p>}
      </section>

      <section className="space-y-3">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Sécurité</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-line/70 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-ink"><MonitorSmartphone size={15} aria-hidden /> {entier(d.sessions.length)} session{d.sessions.length > 1 ? "s" : ""} ouverte{d.sessions.length > 1 ? "s" : ""}</p>
            <ul className="mt-1.5 space-y-1 text-xs text-ink-muted">
              {d.sessions.slice(0, 3).map((s) => <li key={s.creeLe} className="truncate">Active à {heure(s.derniereActivite)} · {navigateur(s.agent)}</li>)}
            </ul>
            <Button type="button" variante="secondaire" taille="sm" className="mt-2 h-10 w-full" disabled={!d.sessions.length || (moi && d.sessions.length <= 1)} chargement={revoquer.isPending}
              onClick={() => revoquer.mutate(d.compte.id, { onSuccess: (r) => notifier({ ton: "succes", titre: "Sessions révoquées", texte: `${entier(r.sessionsRevoquees)} session(s) fermée(s).` }) })}>
              {moi ? "Fermer mes autres sessions" : "Révoquer toutes les sessions"}
            </Button>
          </div>
          <div className="min-w-0 rounded-lg border border-line/70 p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              <LockOpen size={15} aria-hidden /> Verrouillage
              {verrouille ? <Badge ton="critique">jusqu'à {heure(d.compte.verrouilleJusquA!)}</Badge> : <Badge ton="succes">aucun</Badge>}
            </p>
            <p className="mt-1.5 text-xs text-ink-muted">{d.compte.echecs} échec{d.compte.echecs > 1 ? "s" : ""} consécutif{d.compte.echecs > 1 ? "s" : ""} · 5 échecs → 15 min de verrou.</p>
            <Button type="button" variante="secondaire" taille="sm" className="mt-2 h-10 w-full" disabled={!verrouille && d.compte.echecs === 0} chargement={deverrouiller.isPending}
              onClick={() => deverrouiller.mutate(d.compte.id, { onSuccess: () => notifier({ ton: "succes", titre: "Compte déverrouillé" }) })}>
              Déverrouiller
            </Button>
          </div>
        </div>
      </section>

      <AnimatePresence>
        {erreur && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /><span className="min-w-0 break-words">{erreur}</span>
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex flex-col-reverse gap-2 border-t border-line/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
        <p className="flex items-center gap-1.5 text-xs text-ink-muted sm:mr-auto"><ShieldCheck size={13} aria-hidden />Chaque modification est journalisée.</p>
        <Button type="button" variante="secondaire" onClick={onFermer} disabled={modifier.isPending}>Annuler</Button>
        <Button type="button" onClick={enregistrer} chargement={modifier.isPending} disabled={!modifie}>Enregistrer</Button>
      </div>
    </div>
  );
}

function navigateur(agent: string | null) {
  if (!agent) return "appareil inconnu";
  const n = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : /curl/.test(agent) ? "client en ligne de commande" : "navigateur";
  const s = /Android/.test(agent) ? "Android" : /iPhone|iPad/.test(agent) ? "iOS" : /Windows/.test(agent) ? "Windows" : /Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  return s ? `${n} · ${s}` : n;
}
