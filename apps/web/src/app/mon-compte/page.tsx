"use client";

import { ArrowLeft, Fingerprint, KeyRound, LifeBuoy, Mail, Phone, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GardeSession } from "@/components/shell/GardeSession";
import { EASE, motion } from "@/components/motion";
import { CodesSecours } from "@/components/securite/CodesSecours";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { BandeNationale, Badge, Button, Card, Logo, Squelette } from "@/components/ui/primitives";
import { CLES_SECURITE, enregistrerCle, useCoordonnees, useEtatMfa, type Coordonnee } from "@/lib/api/securite";
import { ErreurApi, ecrire } from "@/lib/http";
import { accueilDeSession, useSession } from "@/lib/session";

/** Mon compte : coordonnées de récupération (vérifiées par code) et second facteur. */
export default function PageMonCompte() {
  return <Suspense><GardeSession><MonCompte /></GardeSession></Suspense>;
}

function MonCompte() {
  const session = useSession();
  return (
    <div className="min-h-screen bg-bg">
      <BandeNationale className="h-[4px]" />
      <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Logo />
        <Link href={accueilDeSession(session)} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"><ArrowLeft size={15} aria-hidden /> Retour à mon espace</Link>
      </div>
      <motion.main initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }} className="mx-auto max-w-3xl space-y-5 px-5 pb-16">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-muted">{session.compte.identifiant}</p>
          <h1 className="mt-1 font-display text-[28px] font-bold text-ink">Mon compte</h1>
        </div>
        <Coordonnees />
        <SecondFacteur />
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold text-ink">Mot de passe</p><p className="text-[13px] text-ink-2">Le changer ferme vos autres sessions.</p></div>
          <Link href="/mot-de-passe" className="inline-flex h-10 items-center rounded-md px-4 text-[14px] font-semibold text-ink ring-1 ring-inset ring-line hover:bg-surface-2">Changer</Link>
        </Card>
      </motion.main>
    </div>
  );
}

/* ------------------------------------------------------------------ Coordonnées de récupération */

function Coordonnees() {
  const c = useCoordonnees();
  const [ajout, setAjout] = useState<"sms" | "courriel" | null>(null);
  if (c.isPending) return <Squelette className="h-40 rounded-2xl" />;
  const d = c.data!;
  return (
    <Card>
      <p className="font-semibold text-ink">Coordonnées de récupération</p>
      <p className="text-[13px] text-ink-2">En cas d'oubli du mot de passe, un code n'est envoyé qu'à une coordonnée vérifiée.</p>
      <ul className="mt-4 divide-y divide-line/60">
        <Ligne icone={Phone} libelle="Téléphone" c={d.telephone} ouvert={d.canaux.sms} onModifier={() => setAjout("sms")} />
        <Ligne icone={Mail} libelle="Courriel" c={d.courriel} ouvert={d.canaux.courriel} onModifier={() => setAjout("courriel")} />
      </ul>
      <DialogueCoordonnee canal={ajout} onFermer={() => setAjout(null)} />
    </Card>
  );
}

function Ligne({ icone: Icone, libelle, c, ouvert, onModifier }: { icone: typeof Phone; libelle: string; c: Coordonnee | null; ouvert: boolean; onModifier: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="flex min-w-0 items-center gap-2.5">
        <Icone size={17} className="text-ink-muted" aria-hidden />
        <span className="text-[14px] text-ink">{libelle}</span>
        {c ? <><span className="font-mono text-[13.5px] text-ink-2">{c.valeur}</span><Badge ton={c.verifie ? "succes" : "avertissement"}>{c.verifie ? "Vérifié" : "Non vérifié"}</Badge></> : <span className="text-[13px] text-ink-muted">Non renseigné</span>}
      </span>
      {ouvert ? <Button taille="sm" variante="secondaire" onClick={onModifier}>{c ? "Remplacer" : "Ajouter"}</Button> : <span className="text-[12.5px] text-ink-muted">Canal pas encore ouvert</span>}
    </li>
  );
}

function DialogueCoordonnee({ canal, onFermer }: { canal: "sms" | "courriel" | null; onFermer: () => void }) {
  const client = useQueryClient();
  const [destination, setDestination] = useState("");
  const [envoye, setEnvoye] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const fermer = () => { setDestination(""); setEnvoye(null); setCode(""); setErreur(null); onFermer(); };
  const demander = async () => {
    setEnvoi(true); setErreur(null);
    try { setEnvoye((await ecrire<{ destination: string }>("/moi/coordonnees/demande", { canal, destination })).destination); } catch (x) { setErreur((x as Error).message); } finally { setEnvoi(false); }
  };
  const confirmer = async () => {
    setEnvoi(true); setErreur(null);
    try {
      await ecrire("/moi/coordonnees/confirmer", { code });
      await client.invalidateQueries({ queryKey: CLES_SECURITE.coordonnees });
      notifier({ ton: "succes", titre: "Coordonnée vérifiée", texte: "Elle servira à récupérer votre compte." });
      fermer();
    } catch (x) { setErreur(x instanceof ErreurApi && x.statut === 422 ? "Code invalide ou expiré." : (x as Error).message); setEnvoi(false); }
  };
  const valide = canal === "sms" ? /^\+\d{8,15}$/.test(destination.replace(/[\s.-]/g, "")) : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destination.trim());
  return (
    <Modale ouvert={!!canal} onFermer={fermer} titre={canal === "sms" ? "Téléphone de récupération" : "Courriel de récupération"} icone={canal === "sms" ? Phone : Mail}
      pied={envoye
        ? <><Button variante="secondaire" onClick={fermer}>Annuler</Button><Button chargement={envoi} disabled={!/^\d{6}$/.test(code)} onClick={confirmer}>Vérifier</Button></>
        : <><Button variante="secondaire" onClick={fermer}>Annuler</Button><Button chargement={envoi} disabled={!valide} onClick={demander}>Recevoir un code</Button></>}>
      {envoye ? (
        <label className="block text-[13px] font-medium text-ink">Code envoyé à {envoye}
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="mt-1.5 h-11 w-full rounded-lg border border-line bg-bg px-3 font-mono text-[16px] tracking-[0.25em]" />
        </label>
      ) : (
        <label className="block text-[13px] font-medium text-ink">{canal === "sms" ? "Numéro au format international" : "Adresse électronique"}
          <input autoFocus value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={canal === "sms" ? "+229 01 97 00 00 00" : "prenom.nom@exemple.bj"} inputMode={canal === "sms" ? "tel" : "email"} className="mt-1.5 h-11 w-full rounded-lg border border-line bg-bg px-3 text-[15px]" />
        </label>
      )}
      {erreur && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur}</p>}
    </Modale>
  );
}

/* ------------------------------------------------------------------ Second facteur */

function SecondFacteur() {
  const etat = useEtatMfa();
  const client = useQueryClient();
  const [codes, setCodes] = useState<string[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (etat.isPending) return <Squelette className="h-40 rounded-2xl" />;
  const e = etat.data!;
  const rafraichir = () => client.invalidateQueries({ queryKey: CLES_SECURITE.mfa });

  const ajouterCle = async () => {
    setEnvoi(true);
    try { const r = await enregistrerCle("Clé de sécurité"); if (r.codesSecours?.length) setCodes(r.codesSecours); notifier({ ton: "succes", titre: "Clé enregistrée", texte: "Elle pourra remplacer le code de l'application." }); await rafraichir(); }
    catch (x) { notifier({ ton: "critique", titre: "Clé non enregistrée", texte: x instanceof ErreurApi ? x.message : "Opération annulée ou non prise en charge par cet appareil." }); }
    finally { setEnvoi(false); }
  };
  const retirer = async (id: string) => {
    try { await ecrire(`/auth/mfa/cles/${encodeURIComponent(id)}/retirer`); await rafraichir(); notifier({ ton: "succes", titre: "Clé retirée", texte: "Elle ne permet plus d'accéder au compte." }); }
    catch (x) { notifier({ ton: "critique", titre: "Retrait refusé", texte: (x as Error).message }); }
  };
  const regenerer = async () => {
    try { setCodes((await ecrire<{ codesSecours: string[] }>("/auth/mfa/codes-secours")).codesSecours); await rafraichir(); }
    catch (x) { notifier({ ton: "critique", titre: "Codes non générés", texte: (x as Error).message }); }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck size={17} className="text-accent-ink" aria-hidden /> Second facteur</p>
          <p className="text-[13px] text-ink-2">{e.exige ? "Exigé par votre fonction d'administration." : "Facultatif pour votre compte, recommandé."}</p>
        </div>
        <Badge ton={e.actif ? "succes" : e.exige ? "critique" : "neutre"}>{e.actif ? "Actif" : "Non configuré"}</Badge>
      </div>
      {codes ? (
        <div className="mt-4"><CodesSecours codes={codes} onTermine={() => setCodes(null)} /></div>
      ) : (
        <ul className="mt-4 divide-y divide-line/60">
          <li className="flex items-center justify-between gap-2 py-3">
            <span className="flex items-center gap-2.5 text-[14px] text-ink"><Smartphone size={17} className="text-ink-muted" aria-hidden /> Application d'authentification</span>
            {e.totp ? <Badge ton="succes">Enregistrée</Badge> : <Link href="/second-facteur" className="text-[13px] font-semibold text-blue hover:underline">{e.actif ? "—" : "Configurer"}</Link>}
          </li>
          {e.cles.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex items-center gap-2.5 text-[14px] text-ink"><KeyRound size={17} className="text-ink-muted" aria-hidden /> {k.nom}
                <span className="text-[12px] text-ink-muted">ajoutée le {new Date(k.creeLe).toLocaleDateString("fr-FR")}</span></span>
              <Button taille="sm" variante="fantome" icone={Trash2} onClick={() => retirer(k.id)}>Retirer</Button>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span className="flex items-center gap-2.5 text-[14px] text-ink"><Fingerprint size={17} className="text-ink-muted" aria-hidden /> Clé de sécurité (FIDO2)</span>
            <Button taille="sm" variante="secondaire" chargement={envoi} onClick={ajouterCle} disabled={!e.actif && e.exige}>Ajouter une clé</Button>
          </li>
          {e.actif && (
            <li className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="flex items-center gap-2.5 text-[14px] text-ink"><LifeBuoy size={17} className="text-ink-muted" aria-hidden /> Codes de secours <span className="text-[12.5px] text-ink-muted">{e.codesSecoursRestants} restant(s)</span></span>
              <Button taille="sm" variante="secondaire" onClick={regenerer}>Nouveaux codes</Button>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}
