"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleUserRound, Database, FileWarning, Fingerprint, FolderOpen, Search, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { AnimatePresence, EASE, EntreePage, IndicateurActif, motion } from "@/components/motion";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Squelette } from "@/components/ui/primitives";
import { jourCourant, useInscriptionMutation, useRechercheRegistre, useTableau, type ClasseTableau, type CorpsInscription, type PersonneRegistre, type ResultatInscription } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { ageEnAnnees, classeChamp, dateCourte, EtatErreur, HorsPerimetre, Info, LienBouton } from "../_composants";

type Etape = 1 | 2 | 3 | 4;
const ETAPES = ["Registre national", "Identité et filiation", "Classe", "Confirmation"];
interface SansActe { nom: string; prenoms: string; sexe: "F" | "M"; dateNaissance: string; responsable: string }

const masquerNpi = (npi: string) => `${npi.slice(0, 3)}••••${npi.slice(-3)}`;

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <Inscription id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function Inscription({ id }: { id: string }) {
  const [etape, setEtape] = useState<Etape>(1);
  const [sens, setSens] = useState(1);
  const [nom, setNom] = useState("");
  const [prenoms, setPrenoms] = useState("");
  const [requete, setRequete] = useState<{ nom: string; prenoms: string } | null>(null);
  const [enfant, setEnfant] = useState<PersonneRegistre | null>(null);
  const [sansActe, setSansActe] = useState<SansActe | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatInscription | null>(null);

  const recherche = useRechercheRegistre(requete?.nom ?? "", requete?.prenoms ?? "", !!requete);
  const tableau = useTableau(id);
  const inscrire = useInscriptionMutation();

  const aller = (e: Etape) => { setSens(e > etape ? 1 : -1); setEtape(e); inscrire.reset(); };
  const recommencer = () => { setResultat(null); setEnfant(null); setSansActe(null); setClasseId(null); setNom(""); setPrenoms(""); setRequete(null); setSens(-1); setEtape(1); inscrire.reset(); };

  const identite = enfant
    ? { nom: enfant.nom, prenoms: enfant.prenoms, sexe: enfant.sexe, dateNaissance: enfant.dateNaissance }
    : sansActe ? { nom: sansActe.nom.trim().toUpperCase(), prenoms: sansActe.prenoms.trim(), sexe: sansActe.sexe, dateNaissance: sansActe.dateNaissance } : null;
  const classe = tableau.data?.classes.find((c) => c.id === classeId) ?? null;

  const erreursSansActe = sansActe ? {
    nom: sansActe.nom.trim().length < 2 ? "Au moins 2 caractères." : null,
    prenoms: sansActe.prenoms.trim().length < 2 ? "Au moins 2 caractères." : null,
    dateNaissance: !/^\d{4}-\d{2}-\d{2}$/.test(sansActe.dateNaissance) ? "Date requise." : sansActe.dateNaissance > jourCourant() ? "Date dans le futur." : null,
  } : null;
  const sansActeValide = !!erreursSansActe && !Object.values(erreursSansActe).some(Boolean);

  const chercher = (e: FormEvent) => {
    e.preventDefault();
    if (nom.trim().length + prenoms.trim().length < 2) return;
    setRequete({ nom: nom.trim(), prenoms: prenoms.trim() });
  };

  const confirmer = () => {
    if (!classeId || !identite) return;
    const corps: CorpsInscription = enfant ? { classeId, npi: enfant.npi } : { classeId, sansActe: { ...identite, responsable: sansActe!.responsable.trim() } };
    inscrire.mutate(corps, { onSuccess: (r) => setResultat(r) });
  };

  if (resultat && identite) return <Succes r={resultat} identite={identite} classe={classe} onNouveau={recommencer} />;

  const erreur = inscrire.error instanceof ErreurApi ? inscrire.error : null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/etablissement" className="inline-flex min-h-10 items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> Mon établissement</Link>
      <PageHeader surtitre="Processus P4 · P6" titre="Inscrire un apprenant" sousTitre="Le système éducatif ne crée jamais une identité : il interroge le registre national, puis rattache l'apprenant à une classe." />

      {/* Étapes */}
      <ol className="grid grid-cols-4 gap-1.5 rounded-lg border border-line/70 bg-surface-2/60 p-1" aria-label="Étapes">
        {ETAPES.map((l, i) => {
          const n = (i + 1) as Etape;
          const faite = n < etape;
          return (
            <li key={l} aria-current={n === etape ? "step" : undefined} className="relative">
              {n === etape && <IndicateurActif id="etape-inscription" className="absolute inset-0 rounded-md bg-surface shadow-soft" />}
              <span className={cn("relative flex min-h-10 items-center justify-center gap-2 rounded-md px-2 py-2 text-center text-[12.5px] font-medium", n === etape ? "text-ink" : faite ? "text-success" : "text-ink-muted")}>
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", n === etape ? "bg-navy text-white dark:bg-blue dark:text-navy-deep" : faite ? "bg-success text-white" : "bg-surface text-ink-muted ring-1 ring-line")}>
                  {faite ? <Check size={12} aria-hidden /> : n}
                </span>
                <span className="hidden sm:inline">{l}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-[13px] font-medium text-ink-2 sm:hidden">Étape {etape} sur 4 · {ETAPES[etape - 1]}</p>

      <AnimatePresence mode="wait" custom={sens} initial={false}>
        <motion.div key={etape} custom={sens}
          initial={{ opacity: 0, x: sens * 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: sens * -24 }}
          transition={{ duration: 0.28, ease: EASE }}>

          {etape === 1 && (
            <Card className="space-y-4">
              <form onSubmit={chercher} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Nom</span>
                  <input value={nom} onChange={(e) => setNom(e.target.value.slice(0, 40))} className={cn(classeChamp, "uppercase")} placeholder="WOROU" autoComplete="off" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Prénom(s)</span>
                  <input value={prenoms} onChange={(e) => setPrenoms(e.target.value.slice(0, 40))} className={classeChamp} placeholder="Sidonie" autoComplete="off" />
                </label>
                <Button type="submit" className="self-end" icone={Search} chargement={recherche.isFetching} disabled={nom.trim().length + prenoms.trim().length < 2}>Interroger le registre</Button>
              </form>
              <p className="flex items-start gap-1.5 text-xs text-ink-muted"><Database size={13} className="mt-0.5 shrink-0" aria-hidden /> Requête transmise au registre national des personnes via la plateforme d'interopérabilité ; seuls les enfants en âge scolaire sont renvoyés. Chaque recherche est journalisée.</p>

              {requete && (
                recherche.isPending ? (
                  <div className="space-y-2">{Array.from({ length: 3 }, (_, i) => <Squelette key={i} className="h-16" />)}</div>
                ) : recherche.isError ? (
                  <EtatErreur erreur={recherche.error} reessayer={() => recherche.refetch()} />
                ) : recherche.data.length > 0 ? (
                  <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line/70">
                    {recherche.data.map((p, i) => (
                      <motion.li key={p.npi} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }}
                        className="flex flex-wrap items-center gap-3 px-4 py-3">
                        <CircleUserRound size={22} className="shrink-0 text-ink-muted" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{p.nom} {p.prenoms}</p>
                          <p className="text-xs text-ink-muted">Né·e le {dateCourte(p.dateNaissance)} ({ageEnAnnees(p.dateNaissance, jourCourant())} ans) · NPI {masquerNpi(p.npi)}</p>
                        </div>
                        {p.dejaInscrit ? (
                          <Badge ton="avertissement" icone={AlertTriangle}>Déjà inscrit·e — procéder par transfert</Badge>
                        ) : (
                          <Button taille="sm" icone={ArrowRight} className="w-full sm:w-auto" onClick={() => { setEnfant(p); setSansActe(null); aller(2); }}>Sélectionner</Button>
                        )}
                      </motion.li>
                    ))}
                  </ul>
                ) : (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-warning/30 bg-warning-bg/60 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold text-warning"><FileWarning size={16} aria-hidden /> Aucune personne correspondante au registre national</p>
                    <p className="mt-1 text-[13px] text-ink-2">Tous les enfants ne disposent pas d'un acte d'état civil. Refuser l'inscription exclurait les plus vulnérables : la règle est d'inscrire, signaler et régulariser.</p>
                    <Button className="mt-3" variante="secondaire" taille="sm" onClick={() => { setSansActe({ nom: requete.nom, prenoms: requete.prenoms, sexe: "F", dateNaissance: "", responsable: "" }); setEnfant(null); aller(2); }}>
                      Inscrire avec procédure de régularisation
                    </Button>
                  </motion.div>
                )
              )}
            </Card>
          )}

          {etape === 2 && (
            <Card className="space-y-4">
              {enfant ? (
                <>
                  <Badge ton="succes" icone={Fingerprint}>Identité vérifiée au registre national</Badge>
                  <div>
                    <p className="font-display text-[20px] font-bold text-ink">{enfant.nom} {enfant.prenoms}</p>
                    <p className="text-[13px] text-ink-muted">Né·e le {dateCourte(enfant.dateNaissance)} · {enfant.sexe === "F" ? "féminin" : "masculin"} · NPI {masquerNpi(enfant.npi)}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">Responsables légaux</p>
                    <p className="text-xs text-ink-muted">Lien de filiation issu du registre, non déclaratif.</p>
                    {enfant.parents.length ? (
                      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                        {enfant.parents.map((p) => (
                          <li key={`${p.nom}-${p.prenoms}`} className="flex items-center gap-3 rounded-md bg-surface-2/70 px-3 py-2.5 text-sm">
                            <ShieldCheck size={16} className="shrink-0 text-success" aria-hidden />
                            <span className="min-w-0 flex-1 truncate text-ink">{p.prenoms} {p.nom}</span>
                            <Badge>{p.sexe === "F" ? "Mère" : "Père"}</Badge>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="mt-2 rounded-md bg-surface-2/70 px-3 py-2.5 text-[13px] text-ink-2">Aucun parent rattaché au registre.</p>}
                    <p className="mt-2 text-xs text-ink-muted">Ces responsables recevront l'accès à l'espace famille. Aucun autre adulte ne peut se déclarer parent.</p>
                  </div>
                </>
              ) : sansActe && erreursSansActe && (
                <>
                  <p className="rounded-md bg-warning-bg px-3 py-2.5 text-[13px] text-warning">Identité déclarative, en attente de régularisation. Le lien familial ne sera vérifié qu'après enregistrement à l'état civil.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Champ libelle="Nom" erreur={sansActe.nom ? erreursSansActe.nom : null}>
                      <input value={sansActe.nom} onChange={(e) => setSansActe({ ...sansActe, nom: e.target.value.slice(0, 40) })} className={cn(classeChamp, "uppercase")} />
                    </Champ>
                    <Champ libelle="Prénom(s)" erreur={sansActe.prenoms ? erreursSansActe.prenoms : null}>
                      <input value={sansActe.prenoms} onChange={(e) => setSansActe({ ...sansActe, prenoms: e.target.value.slice(0, 60) })} className={classeChamp} />
                    </Champ>
                    <Champ libelle="Date de naissance déclarée" erreur={sansActe.dateNaissance ? erreursSansActe.dateNaissance : null}>
                      <input type="date" value={sansActe.dateNaissance} max={jourCourant()} onChange={(e) => setSansActe({ ...sansActe, dateNaissance: e.target.value })} className={classeChamp} />
                    </Champ>
                    <Champ libelle="Sexe">
                      <select value={sansActe.sexe} onChange={(e) => setSansActe({ ...sansActe, sexe: e.target.value as "F" | "M" })} className={classeChamp}>
                        <option value="F">Féminin</option><option value="M">Masculin</option>
                      </select>
                    </Champ>
                    <Champ libelle="Responsable déclaré" className="sm:col-span-2">
                      <input value={sansActe.responsable} onChange={(e) => setSansActe({ ...sansActe, responsable: e.target.value.slice(0, 80) })} className={classeChamp} placeholder="Nom et prénom du parent ou tuteur" />
                    </Champ>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
                <Button variante="secondaire" onClick={() => aller(1)}>Retour</Button>
                <Button icone={ArrowRight} disabled={!!sansActe && !sansActeValide} onClick={() => aller(3)}>Choisir la classe</Button>
              </div>
            </Card>
          )}

          {etape === 3 && (
            <Card className="space-y-4">
              <CardHeader className="mb-0" title="Classe d'accueil" subtitle="Effectifs lus en temps réel dans la projection du registre ; une classe complète ne peut pas recevoir d'inscription." />
              {tableau.isPending ? (
                <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-16" />)}</div>
              ) : tableau.isError ? (
                <EtatErreur erreur={tableau.error} reessayer={() => tableau.refetch()} />
              ) : tableau.data.classes.length === 0 ? (
                <EtatVide icone={FolderOpen} titre="Aucune classe ouverte" />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Classe d'accueil">
                  {tableau.data.classes.map((c) => <ChoixClasse key={c.id} c={c} actif={classeId === c.id} onChoisir={() => setClasseId(c.id)} />)}
                </ul>
              )}
              <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
                <Button variante="secondaire" onClick={() => aller(2)}>Retour</Button>
                <Button icone={ArrowRight} disabled={!classe || classe.effectif >= classe.capacite} onClick={() => aller(4)}>Vérifier</Button>
              </div>
            </Card>
          )}

          {etape === 4 && identite && (
            <Card className="space-y-4">
              <CardHeader className="mb-0" title="Récapitulatif" subtitle="L'inscription crée l'identifiant éducatif et inscrit les événements au registre, en une seule transaction." />
              <dl className="grid gap-2 sm:grid-cols-2">
                <Info libelle="Apprenant">{identite.nom} {identite.prenoms}</Info>
                <Info libelle="Identité">{enfant ? "Vérifiée (registre national)" : "Régularisation à engager"}</Info>
                <Info libelle="Classe">{classe ? `${classe.libelle} · ${classe.effectif}/${classe.capacite} élèves` : "—"}</Info>
                <Info libelle="Naissance">{identite.dateNaissance ? dateCourte(identite.dateNaissance) : "—"}</Info>
                <Info libelle="Responsables">{enfant ? (enfant.parents.map((p) => `${p.prenoms} ${p.nom}`).join(", ") || "—") : sansActe?.responsable.trim() || "Non renseigné"}</Info>
                <Info libelle="Établissement">{tableau.data?.etablissement.nom ?? "—"}</Info>
              </dl>

              <AnimatePresence>
                {erreur && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert"
                    className="rounded-lg border border-critical/30 bg-critical-bg/60 p-4">
                    <p className="text-sm font-semibold text-critical">
                      {erreur.statut === 409 ? (/complète/i.test(erreur.message) ? "Classe complète" : "Déjà inscrit·e") : erreur.statut === 422 ? "Données non conformes" : erreur.statut === 403 ? "Inscription refusée" : erreur.statut === 404 ? "Personne introuvable" : "Inscription non enregistrée"}
                    </p>
                    <p className="mt-1 text-[13px] text-ink-2">{erreur.message}</p>
                    {erreur.statut === 409 && (
                      /complète/i.test(erreur.message)
                        ? <Button className="mt-3" variante="secondaire" taille="sm" onClick={() => { setClasseId(null); aller(3); }}>Choisir une autre classe</Button>
                        : <Button className="mt-3" variante="secondaire" taille="sm" onClick={() => aller(1)}>Revenir à la recherche</Button>
                    )}
                    {erreur.statut === 422 && !enfant && <Button className="mt-3" variante="secondaire" taille="sm" onClick={() => aller(2)}>Corriger l'identité</Button>}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-end gap-3 border-t border-line/60 pt-4">
                <Button variante="secondaire" onClick={() => aller(3)} disabled={inscrire.isPending}>Retour</Button>
                <Button variante="valider" icone={Check} chargement={inscrire.isPending} onClick={confirmer}>Confirmer l'inscription</Button>
              </div>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Champ({ libelle, erreur, className, children }: { libelle: string; erreur?: string | null; className?: string; children: React.ReactNode }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{libelle}</span>
      {children}
      {erreur && <span className="mt-1 block text-xs text-critical">{erreur}</span>}
    </label>
  );
}

function ChoixClasse({ c, actif, onChoisir }: { c: ClasseTableau; actif: boolean; onChoisir: () => void }) {
  const places = c.capacite - c.effectif;
  const pleine = places <= 0;
  return (
    <li>
      <button type="button" role="radio" aria-checked={actif} disabled={pleine} onClick={onChoisir}
        className={cn("flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all active:scale-[0.99]",
          actif ? "border-blue bg-blue-soft/40 ring-4 ring-blue/15" : "border-line/70 hover:-translate-y-0.5 hover:bg-surface-2/60 hover:shadow-soft", pleine && "cursor-not-allowed opacity-55 hover:translate-y-0")}>
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", actif ? "border-blue bg-blue text-white" : "border-line")}>{actif && <Check size={12} aria-hidden />}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{c.libelle}</span>
          <span className="text-xs text-ink-muted">{c.effectif}/{c.capacite} élèves{c.professeurPrincipal ? ` · PP ${c.professeurPrincipal}` : ""}</span>
        </span>
        {pleine ? <Badge ton="critique">Complète</Badge> : <Badge ton={places <= 3 ? "avertissement" : "succes"}>{places} place{places > 1 ? "s" : ""}</Badge>}
      </button>
    </li>
  );
}

function Succes({ r, identite, classe, onNouveau }: { r: ResultatInscription; identite: { nom: string; prenoms: string }; classe: ClasseTableau | null; onNouveau: () => void }) {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
        <Card className="text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.15 }}
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success"><Check size={28} aria-hidden /></motion.span>
          <h1 className="mt-4 text-[22px] font-bold text-ink sm:text-[24px]">{identite.prenoms} {identite.nom} est inscrit·e{classe ? ` en ${classe.libelle}` : ""}</h1>
          <p className="mt-1 text-ink-2">Identifiant éducatif <span className="font-mono font-semibold text-ink">{r.apprenantId}</span> — stable d'un établissement et d'un cycle à l'autre.</p>
          {r.statutIdentite === "regularisation_en_cours" && (
            <p className="mx-auto mt-4 max-w-md rounded-md bg-warning-bg px-4 py-3 text-[13px] text-warning">L'enfant n'a pas été exclu faute d'acte de naissance : l'inscription est effective et une demande de régularisation a été transmise.</p>
          )}
          <div className="mx-auto mt-5 max-w-md text-left">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Événements inscrits au registre</p>
            <ul className="mt-2 space-y-1">
              {r.evenements.map((e, i) => (
                <motion.li key={e} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex items-center gap-2 font-mono text-[12px] text-ink-2">
                  <Check size={12} className="text-success" aria-hidden /> <span className="truncate">{e}</span>
                </motion.li>
              ))}
            </ul>
            <p className="mt-3 text-[12.5px] text-ink-muted">Ils alimentent immédiatement l'effectif de la classe, le passeport éducatif, la notification aux parents vérifiés et les indicateurs territoriaux.</p>
          </div>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <LienBouton href={`/etablissement/eleves/${r.apprenantId}`} variante="secondaire" icone={FolderOpen}>Ouvrir le dossier</LienBouton>
            <Button icone={UserPlus} onClick={onNouveau}>Nouvelle inscription</Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
