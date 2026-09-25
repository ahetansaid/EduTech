"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, BadgeCheck, Check, IdCard, KeyRound, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, EASE, motion } from "@/components/motion";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { LIBELLE_ROLE, useCreerUtilisateurMutation, useFicheNpi, useIdentifiantPropose, type FicheNpi, type UtilisateurCree } from "@/lib/api/administration";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";
import { brouillonVide, EditeurHabilitations, validerTout, type Brouillon } from "./EditeurHabilitations";
import { Champ, CHAMP, SecretUnique } from "./communs";

const ETAPES = [
  { id: "identite", libelle: "Identité", icone: IdCard },
  { id: "habilitations", libelle: "Habilitations", icone: ShieldCheck },
  { id: "recapitulatif", libelle: "Récapitulatif", icone: BadgeCheck },
  { id: "acces", libelle: "Accès", icone: KeyRound },
] as const;

const RE_NOM = /^\p{L}[\p{L}\p{M}' .’-]*$/u;
const RE_IDENTIFIANT = /^[a-z][a-z0-9-]{0,39}(\.[a-z0-9-]{1,40}){1,2}$/;

/**
 * Création d'un utilisateur en quatre étapes : identité (NPI vérifié au registre, nom, fonction, identifiant
 * proposé) → habilitations (périmètres dynamiques) → récapitulatif → affichage unique du mot de passe temporaire.
 */
export function NouvelUtilisateur({ versComptes }: { versComptes: () => void }) {
  const [etape, setEtape] = useState(0);
  const [sens, setSens] = useState(1);
  const [npi, setNpi] = useState("");
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [identifiantLibre, setIdentifiantLibre] = useState<string | null>(null);
  const [brouillons, setBrouillons] = useState<Brouillon[]>([brouillonVide()]);
  const [tente, setTente] = useState(false);
  const [erreurServeur, setErreurServeur] = useState<string | null>(null);
  // Résultat (mot de passe compris) : uniquement dans l'état de ce composant.
  const [cree, setCree] = useState<UtilisateurCree | null>(null);

  const creer = useCreerUtilisateurMutation();
  const npiValide = /^\d{10}$/.test(npi);
  const fiche = useFicheNpi(npi);
  const propose = useIdentifiantPropose(identifiantLibre === null ? nom : "");
  const identifiant = identifiantLibre ?? propose.data?.identifiant ?? "";

  const erreursIdentite = {
    npi: npi && !npiValide ? "Le NPI comporte exactement 10 chiffres." : npiValide && fiche.data && !fiche.data.personne ? "NPI inconnu du registre national des personnes." : npiValide && fiche.data?.profilExistant ? `Déjà rattaché au profil de ${fiche.data.profilExistant.nomAffiche}.` : null,
    nom: nom.trim().length < 3 ? "3 caractères au moins." : !RE_NOM.test(nom.trim()) ? "Lettres, espaces, apostrophes et tirets uniquement." : null,
    fonction: fonction.trim().length < 3 ? "Précisez la fonction (3 caractères au moins)." : null,
    identifiant: !identifiant ? "Identifiant requis." : !RE_IDENTIFIANT.test(identifiant) ? "Format prenom.nom : minuscules, chiffres, tirets." : null,
  };
  const identiteValide = !Object.values(erreursIdentite).some(Boolean) && !(npiValide && fiche.isPending);
  const npiRetenu = npiValide ? npi : null;
  const validation = validerTout(brouillons, npiRetenu, fiche.data);

  const aller = (n: number) => { setSens(n > etape ? 1 : -1); setEtape(n); setTente(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const suivant = () => {
    setTente(true);
    if (etape === 0 && !identiteValide) return;
    if (etape === 1 && !validation.valide) return;
    aller(etape + 1);
  };
  const soumettre = async () => {
    setErreurServeur(null);
    try {
      const r = await creer.mutateAsync({ nomAffiche: nom.trim(), fonction: fonction.trim(), npi: npiRetenu, identifiant, habilitations: validation.habilitations });
      creer.reset();
      setCree(r);
      notifier({ ton: "succes", titre: "Utilisateur créé", texte: `${r.profil.nomAffiche} · ${r.compte.identifiant}` });
      aller(3);
    } catch (e) {
      setErreurServeur(e instanceof ErreurApi ? e.message : "Création impossible. Réessayez.");
    }
  };
  const recommencer = () => {
    setCree(null); setNpi(""); setNom(""); setFonction(""); setIdentifiantLibre(null); setBrouillons([brouillonVide()]); setErreurServeur(null); aller(0);
  };
  const prefillNom = (f: FicheNpi) => { if (f.personne) setNom(`${f.personne.prenoms} ${f.personne.nom}`); };

  return (
    <Card className="min-w-0 p-0" data-guide="admin-creer">
      {/* Progression */}
      <ol className="grid grid-cols-4 border-b border-line/60">
        {ETAPES.map((e, i) => {
          const fait = i < etape;
          const courant = i === etape;
          return (
            <li key={e.id} className="relative min-w-0">
              <div className={cn("flex flex-col items-center gap-1.5 px-1 py-3 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3", courant ? "text-ink" : fait ? "text-success" : "text-ink-muted")} aria-current={courant ? "step" : undefined}>
                <motion.span animate={{ scale: courant ? 1.08 : 1 }} className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors", courant ? "bg-navy text-white dark:bg-blue dark:text-navy-deep" : fait ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted")}>
                  {fait ? <Check size={15} strokeWidth={3} aria-hidden /> : <e.icone size={15} aria-hidden />}
                </motion.span>
                <span className="w-full truncate text-[11.5px] font-medium sm:w-auto sm:text-[13px]">{e.libelle}</span>
              </div>
              {courant && <motion.span layoutId="etape-active" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue" transition={{ type: "spring", stiffness: 420, damping: 36 }} aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className="overflow-hidden p-4 sm:p-6">
        <AnimatePresence mode="wait" custom={sens} initial={false}>
          <motion.div key={etape} custom={sens} initial={{ opacity: 0, x: sens * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: sens * -24 }} transition={{ duration: 0.28, ease: EASE }} className="space-y-5">
            {etape === 0 && (
              <>
                <EnTete titre="Qui est la personne ?" texte="Le NPI (numéro personnel d'identification) est vérifié au registre national. Il est exigé pour les rôles enseignant, parent et apprenant." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ id="npi" libelle="NPI" facultatif erreur={tente || npi.length >= 10 ? erreursIdentite.npi : null} aide="10 chiffres — laisser vide pour un agent sans rôle nominatif.">
                    <div className="relative">
                      <input id="npi" inputMode="numeric" autoComplete="off" maxLength={10} value={npi} onChange={(e) => setNpi(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="1000000000" className={cn(CHAMP, "pr-10 font-mono tracking-wider")} />
                      {npiValide && fiche.isFetching && <Loader2 size={16} className="absolute right-3 top-3 animate-spin text-ink-muted" aria-hidden />}
                      {npiValide && fiche.data?.personne && !fiche.data.profilExistant && <BadgeCheck size={17} className="absolute right-3 top-[11px] text-success" aria-label="NPI vérifié" />}
                    </div>
                  </Champ>
                  <div className="min-w-0 sm:pt-7">
                    <AnimatePresence>
                      {npiValide && fiche.data?.personne && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-success/30 bg-success-bg/60 px-3 py-2.5 text-sm">
                          <p className="font-medium text-ink">{fiche.data.personne.prenoms} {fiche.data.personne.nom}</p>
                          <p className="mt-0.5 text-xs text-ink-2">
                            Registre national{fiche.data.enseignant ? ` · enseignant à ${fiche.data.enseignant.etablissement}` : ""}{fiche.data.apprenant ? " · dossier apprenant" : ""}{fiche.data.enfantsLies ? ` · ${fiche.data.enfantsLies} enfant(s) lié(s)` : ""}
                          </p>
                          {nom.trim() !== `${fiche.data.personne.prenoms} ${fiche.data.personne.nom}` && (
                            <button type="button" onClick={() => prefillNom(fiche.data!)} className="mt-1.5 text-xs font-medium text-accent-ink underline-offset-2 hover:underline">Reprendre ce nom</button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ id="nom" libelle="Nom affiché" erreur={tente || nom ? erreursIdentite.nom : null} aide="Prénom puis NOM, tel qu'il apparaîtra dans l'application.">
                    <input id="nom" autoComplete="off" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Grâce KPADONOU" className={CHAMP} />
                  </Champ>
                  <Champ id="fonction" libelle="Fonction" erreur={tente ? erreursIdentite.fonction : null} aide="Ex. « Enseignante de SVT · CEG Les Rôniers ».">
                    <input id="fonction" autoComplete="off" maxLength={120} value={fonction} onChange={(e) => setFonction(e.target.value)} className={CHAMP} />
                  </Champ>
                </div>
                <Champ id="identifiant" libelle="Identifiant de connexion" erreur={tente || identifiantLibre !== null ? erreursIdentite.identifiant : null}
                  aide={identifiantLibre === null ? "Proposé automatiquement (prenom.nom), unique : un numéro est ajouté en cas d'homonymie." : "Identifiant personnalisé : son unicité est vérifiée à la création."}>
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <input id="identifiant" autoComplete="off" spellCheck={false} maxLength={80} value={identifiant} readOnly={identifiantLibre === null}
                        onChange={(e) => setIdentifiantLibre(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ""))}
                        placeholder="prenom.nom" className={cn(CHAMP, "font-mono", identifiantLibre === null && "bg-surface-2/60")} />
                      {identifiantLibre === null && propose.isFetching && <Loader2 size={16} className="absolute right-3 top-3 animate-spin text-ink-muted" aria-hidden />}
                    </div>
                    <Button type="button" variante="secondaire" className="shrink-0" onClick={() => setIdentifiantLibre(identifiantLibre === null ? identifiant : null)}>
                      {identifiantLibre === null ? "Modifier" : "Proposer"}
                    </Button>
                  </div>
                </Champ>
              </>
            )}

            {etape === 1 && (
              <>
                <EnTete titre="Que peut-elle faire, et où ?" texte="Une habilitation associe un rôle à un périmètre. Le serveur vérifie la cohérence : établissement, circonscription ou département existants, NPI de l'enseignant affecté à l'établissement choisi, dossier apprenant titulaire du NPI." />
                <EditeurHabilitations valeur={brouillons} onChange={setBrouillons} npi={npiRetenu} fiche={fiche.data} erreurs={tente ? validation.erreurs : {}} />
              </>
            )}

            {etape === 2 && (
              <>
                <EnTete titre="Vérifiez avant de créer" texte="Le compte sera créé avec un mot de passe temporaire, à changer obligatoirement à la première connexion." />
                <dl className="grid gap-3 sm:grid-cols-2">
                  <Ligne libelle="Nom affiché" valeur={nom.trim()} />
                  <Ligne libelle="Fonction" valeur={fonction.trim()} />
                  <Ligne libelle="Identifiant" valeur={<span className="font-mono">{identifiant}</span>} />
                  <Ligne libelle="NPI" valeur={npiRetenu ? <span className="font-mono">{npiRetenu}</span> : <span className="text-ink-muted">Aucun</span>} />
                </dl>
                <div>
                  <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Habilitations</p>
                  <ul className="divide-y divide-line/60 rounded-lg border border-line/70">
                    {brouillons.map((b) => (
                      <li key={b.cle} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                        <span className="text-sm font-medium text-ink">{b.role ? LIBELLE_ROLE[b.role] : "—"}</span>
                        <Badge ton="marque">{b.etablissementNom ?? b.circonscription ?? b.departementId ?? (b.role === "parent" ? "Famille (NPI)" : b.role === "apprenant" ? "Dossier personnel" : "National")}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
                <AnimatePresence>
                  {erreurServeur && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex items-start gap-2 rounded-md bg-critical-bg px-3.5 py-2.5 text-[13px] text-critical">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
                      <span className="min-w-0 break-words">{erreurServeur}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <p className="flex items-center gap-1.5 text-xs text-ink-muted"><ShieldCheck size={13} aria-hidden />La création sera inscrite au journal d'audit à votre nom.</p>
              </>
            )}

            {etape === 3 && cree && (
              <>
                <div className="flex items-start gap-3">
                  <motion.span initial={{ scale: 0.6, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 18 }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                    <Check size={22} strokeWidth={3} aria-hidden />
                  </motion.span>
                  <EnTete titre="Compte créé" texte={`${cree.profil.nomAffiche} peut se connecter avec l'identifiant ${cree.compte.identifiant} et le mot de passe temporaire ci-dessous.`} />
                </div>
                <SecretUnique nom={cree.profil.nomAffiche} identifiant={cree.compte.identifiant} motDePasse={cree.motDePasseTemporaire} />
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-line/60 bg-surface-2/40 px-4 py-3 sm:flex-row sm:justify-between sm:px-6">
        {etape < 3 ? (
          <>
            <Button type="button" variante="secondaire" icone={ArrowLeft} disabled={etape === 0 || creer.isPending} onClick={() => aller(etape - 1)}>Précédent</Button>
            {etape < 2 ? (
              <Button type="button" onClick={suivant} disabled={etape === 0 && npiValide && fiche.isPending}>Suivant <ArrowRight size={16} aria-hidden /></Button>
            ) : (
              <Button type="button" variante="valider" icone={UserPlus} chargement={creer.isPending} onClick={soumettre}>Créer le compte</Button>
            )}
          </>
        ) : (
          <>
            <Button type="button" variante="secondaire" icone={Users} onClick={versComptes}>Voir les comptes</Button>
            <Button type="button" icone={UserPlus} onClick={recommencer}>J'ai transmis — nouvel utilisateur</Button>
          </>
        )}
      </div>
    </Card>
  );
}

function EnTete({ titre, texte }: { titre: string; texte: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-[17px] font-semibold text-ink">{titre}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-2">{texte}</p>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-2/60 px-3 py-2.5">
      <dt className="text-xs text-ink-muted">{libelle}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium text-ink">{valeur}</dd>
    </div>
  );
}
