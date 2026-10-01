"use client";

import { Check, ChevronRight, KeyRound, RotateCcw, Search, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Cascade, Element, EntreePage } from "@/components/motion";
import { Modale } from "@/components/ui/Modale";
import { notifier } from "@/components/ui/Notifications";
import { Badge, Button, Card, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import {
  LIBELLE_NIVEAU, LIBELLE_ROLE, TYPES_DU_ROLE, useActionDelegation, useComptesDelegues, useMaDelegation, useNominationsAValider, useSousOrganisations,
  type CompteDelegue, type MaDelegation, type Organisation,
} from "@/lib/api/delegation";
import { cn } from "@/lib/cn";
import { ErreurApi } from "@/lib/http";

/**
 * Administration déléguée : chaque administrateur gère les comptes de son sous-arbre de l'organisation de
 * l'État, nomme les administrateurs des niveaux inférieurs, reconfirme ou révoque les droits. Les règles
 * (portée, plafond, cumul, double validation, échéance) sont toutes décidées par le serveur.
 */

type Onglet = "comptes" | "administrateurs" | "valider";
const date = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const bientot = (iso: string) => new Date(iso).getTime() - Date.now() < 30 * 86_400_000;
const messageErreur = (e: unknown) => (e instanceof ErreurApi ? e.message : "Action impossible pour le moment.");

export default function AdministrationDeleguee() {
  const moi = useMaDelegation();
  const [indexDelegation, setIndexDelegation] = useState(0);
  const d = moi.data?.delegations[indexDelegation];
  const [chemin, setChemin] = useState<Organisation[]>([]);
  const courante = chemin.at(-1) ?? d?.organisation ?? null;
  const [onglet, setOnglet] = useState<Onglet>("comptes");

  if (moi.isPending) return <EntreePage><div className="space-y-4"><Squelette className="h-24 rounded-2xl" /><Squelette className="h-80 rounded-2xl" /></div></EntreePage>;
  if (!d) return <EntreePage><Card><EtatVide icone={KeyRound} titre="Aucune délégation active" texte="Vous ne portez pas de délégation d'administration, ou elle est arrivée à échéance. Adressez-vous à votre administrateur de rattachement." /></Card></EntreePage>;

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader surtitre={LIBELLE_NIVEAU[d.niveau] ?? `Niveau ${d.niveau}`} titre="Administration déléguée" />
        {moi.data!.delegations.length > 1 && (
          <Segmente label="Délégation" valeur={String(indexDelegation)} onChange={(v) => { setIndexDelegation(Number(v)); setChemin([]); }}
            options={moi.data!.delegations.map((x, i) => ({ valeur: String(i), libelle: x.organisation?.nom ?? x.organisationId }))} />
        )}
        <Card className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">Votre délégation</p>
              <p className="mt-1 font-semibold text-ink">{d.organisation?.nom}</p>
              <p className="mt-0.5 text-[13px] text-ink-muted">Jusqu&apos;au {date(d.au)} · {d.peutNommer ? "peut nommer des administrateurs" : "ne nomme pas d'administrateur"}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">{d.rolesDelegables.map((r) => <Badge key={r} ton="neutre">{LIBELLE_ROLE[r] ?? r}</Badge>)}</div>
          </div>
          <Fil racine={d.organisation!} chemin={chemin} onChemin={setChemin} />
        </Card>

        <Segmente label="Section" valeur={onglet} onChange={(v) => setOnglet(v as Onglet)} options={[
          { valeur: "comptes", libelle: "Comptes" },
          { valeur: "administrateurs", libelle: "Sous-organisations" },
          { valeur: "valider", libelle: `À valider${moi.data!.aValider ? ` (${moi.data!.aValider})` : ""}` },
        ]} />

        {onglet === "comptes" && courante && <Comptes delegation={d} organisation={courante} />}
        {onglet === "administrateurs" && courante && <SousOrganisations delegation={d} organisation={courante} onOuvrir={(o) => setChemin([...chemin, o])} />}
        {onglet === "valider" && <AValider />}
      </div>
    </EntreePage>
  );
}

/** Fil d'Ariane dans le sous-arbre de la délégation (on ne remonte jamais au-dessus de sa racine). */
function Fil({ racine, chemin, onChemin }: { racine: Organisation; chemin: Organisation[]; onChemin: (c: Organisation[]) => void }) {
  if (!chemin.length) return null;
  return (
    <nav aria-label="Position dans l'arbre" className="mt-4 flex flex-wrap items-center gap-1 border-t border-line/60 pt-3 text-[13px]">
      <button type="button" onClick={() => onChemin([])} className="rounded px-1.5 py-0.5 text-blue hover:underline">{racine.nom}</button>
      {chemin.map((o, i) => (
        <span key={o.id} className="flex items-center gap-1">
          <ChevronRight size={13} className="text-ink-muted" aria-hidden />
          {i === chemin.length - 1 ? <span className="px-1.5 font-semibold text-ink">{o.nom}</span>
            : <button type="button" onClick={() => onChemin(chemin.slice(0, i + 1))} className="rounded px-1.5 py-0.5 text-blue hover:underline">{o.nom}</button>}
        </span>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ Comptes */

function Comptes({ delegation: d, organisation: org }: { delegation: MaDelegation; organisation: Organisation }) {
  const [q, setQ] = useState("");
  const comptes = useComptesDelegues(org.id, q.trim());
  const [creation, setCreation] = useState(false);
  const [revocation, setRevocation] = useState<{ id: string; libelle: string } | null>(null);
  const action = useActionDelegation();
  const rolesPossibles = d.rolesDelegables.filter((r) => (TYPES_DU_ROLE[r] ?? []).includes(org.type));

  const reconfirmer = (id: string) => action.mutate({ chemin: `/delegation/attributions/${id}/reconfirmer` }, {
    onSuccess: () => notifier({ ton: "succes", titre: "Droit reconfirmé", texte: "Prolongé d'un an, dans la limite de votre propre délégation." }),
    onError: (e) => notifier({ ton: "critique", titre: "Reconfirmation refusée", texte: messageErreur(e) }),
  });

  return (
    <section className="space-y-3" aria-label="Comptes">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block sm:w-80">
          <span className="sr-only">Rechercher un compte</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou identifiant" className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
        </label>
        <Button icone={UserPlus} onClick={() => setCreation(true)} disabled={!rolesPossibles.length} title={rolesPossibles.length ? undefined : "Aucun rôle attribuable sur ce type d'organisation : descendez dans l'arbre"}>Nouveau compte</Button>
      </div>
      {comptes.isPending ? <Squelette className="h-40 rounded-2xl" /> : !comptes.data?.length ? (
        <Card><EtatVide icone={Users} titre="Aucun compte dans ce périmètre" texte="Créez le premier compte, ou descendez dans l'arbre des sous-organisations." /></Card>
      ) : (
        <Cascade className="space-y-2.5">
          {comptes.data.map((c) => <Element key={c.id}><LigneCompte c={c} onRevoquer={(id, libelle) => setRevocation({ id, libelle })} onReconfirmer={reconfirmer} /></Element>)}
        </Cascade>
      )}
      <DialogueCreation ouvert={creation} onFermer={() => setCreation(false)} organisation={org} roles={rolesPossibles} />
      <DialogueRevocation cible={revocation} onFermer={() => setRevocation(null)} />
    </section>
  );
}

function LigneCompte({ c, onRevoquer, onReconfirmer }: { c: CompteDelegue; onRevoquer: (id: string, libelle: string) => void; onReconfirmer: (id: string) => void }) {
  return (
    <Card className="min-w-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{c.nomAffiche}</p>
          <p className="text-[12.5px] text-ink-muted">{c.identifiant ?? "sans compte"}{c.actif === false ? " · désactivé" : ""} · {c.fonction}</p>
        </div>
        {c.cumul && <Badge ton="avertissement" icone={ShieldCheck}>Cumul métier et administration</Badge>}
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {c.attributions.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-[13px]">
            <span className="min-w-0"><strong className="font-semibold text-ink">{LIBELLE_ROLE[a.role] ?? a.role}</strong> · {a.organisation}
              <span className={cn("ml-1.5", bientot(a.au) ? "font-semibold text-warning" : "text-ink-muted")}>· jusqu&apos;au {date(a.au)}</span></span>
            {a.gerable && <span className="flex gap-1.5">
              <button type="button" onClick={() => onReconfirmer(a.id)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-blue hover:bg-blue-soft"><RotateCcw size={13} aria-hidden /> Reconfirmer</button>
              <button type="button" onClick={() => onRevoquer(a.id, `${LIBELLE_ROLE[a.role] ?? a.role} — ${c.nomAffiche}`)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-semibold text-critical hover:bg-critical-bg"><X size={13} aria-hidden /> Révoquer</button>
            </span>}
          </li>
        ))}
        {c.delegations.map((x) => (
          <li key={x.id} className="rounded-lg border border-dashed border-line px-3 py-2 text-[13px] text-ink-2">
            <KeyRound size={13} className="mr-1.5 inline text-accent-ink" aria-hidden />Administrateur · {LIBELLE_NIVEAU[x.niveau] ?? x.niveau} · {x.organisation}
            {x.statut === "en_attente" && <Badge ton="info" className="ml-2">En attente de validation</Badge>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DialogueCreation({ ouvert, onFermer, organisation, roles }: { ouvert: boolean; onFermer: () => void; organisation: Organisation; roles: string[] }) {
  const action = useActionDelegation<{ compte: { identifiant: string }; motDePasseTemporaire?: string; activation?: { canal: "sms" | "courriel"; destination: string }; au: string }>();
  const vide = { nomAffiche: "", fonction: "", npi: "", apprenantId: "", role: roles[0] ?? "", telephone: "", courriel: "" };
  const [f, setF] = useState(vide);
  const [resultat, setResultat] = useState<{ identifiant: string; mdp?: string; activation?: { canal: string; destination: string }; au: string } | null>(null);
  const fermer = () => { setResultat(null); setF(vide); action.reset(); onFermer(); };
  const role = f.role || roles[0] || "";
  const npiRequis = ["enseignant", "apprenant", "parent"].includes(role);
  const envoyer = () => action.mutate({ chemin: "/delegation/comptes", corps: {
    nomAffiche: f.nomAffiche.trim(), fonction: f.fonction.trim(), role, organisationId: organisation.id,
    ...(f.npi.trim() ? { npi: f.npi.trim() } : {}), ...(role === "apprenant" ? { apprenantId: f.apprenantId.trim() } : {}),
    ...(f.telephone.trim() ? { telephone: f.telephone.trim() } : {}), ...(f.courriel.trim() ? { courriel: f.courriel.trim() } : {}),
  } }, { onSuccess: (r) => setResultat({ identifiant: r.compte.identifiant, mdp: r.motDePasseTemporaire, activation: r.activation, au: r.au }) });
  return (
    <Modale ouvert={ouvert} onFermer={fermer} titre="Nouveau compte" sousTitre={organisation.nom} icone={UserPlus}
      pied={resultat ? <Button onClick={fermer}>Terminé</Button> : (
        <><Button variante="secondaire" onClick={fermer}>Annuler</Button>
          <Button icone={Check} chargement={action.isPending} onClick={envoyer} disabled={f.nomAffiche.trim().length < 3 || f.fonction.trim().length < 2 || (npiRequis && !/^\d{10}$/.test(f.npi.trim()))}>Créer</Button></>
      )}>
      {resultat ? (
        <div className="space-y-3 text-[14px]">
          <p className="rounded-lg bg-success-bg px-3 py-2 text-success">Compte créé, valable jusqu&apos;au {date(resultat.au)}.</p>
          <p>Identifiant : <strong className="font-mono">{resultat.identifiant}</strong></p>
          {resultat.activation ? (
            <p className="text-[13.5px] text-ink-2">La personne a reçu son identifiant par {resultat.activation.canal === "sms" ? "SMS" : "courriel"} ({resultat.activation.destination}). Elle active elle-même son compte (« Activer mon compte ») : aucun mot de passe ne vous est montré.</p>
          ) : (
            <>
              <p>Mot de passe provisoire : <strong className="font-mono">{resultat.mdp}</strong></p>
              <p className="text-[12.5px] text-ink-muted">Il n&apos;est affiché qu&apos;une fois. Remettez-le en main propre ; il devra être changé à la première connexion. Avec un téléphone ou un courriel, la personne activerait elle-même son compte.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Champ libelle="Nom affiché" valeur={f.nomAffiche} onChange={(v) => setF({ ...f, nomAffiche: v })} placeholder="Prénom NOM" />
          <Champ libelle="Fonction" valeur={f.fonction} onChange={(v) => setF({ ...f, fonction: v })} placeholder="Professeur de mathématiques" />
          <label className="block text-[13px] font-medium text-ink">Rôle
            <select value={role} onChange={(e) => setF({ ...f, role: e.target.value })} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[14px]">
              {roles.map((r) => <option key={r} value={r}>{LIBELLE_ROLE[r] ?? r}</option>)}
            </select>
          </label>
          <Champ libelle={`NPI${npiRequis ? " (obligatoire)" : " (facultatif)"}`} valeur={f.npi} onChange={(v) => setF({ ...f, npi: v.replace(/\D/g, "").slice(0, 10) })} placeholder="10 chiffres" />
          {role === "apprenant" && <Champ libelle="Dossier de l'apprenant" valeur={f.apprenantId} onChange={(v) => setF({ ...f, apprenantId: v.toUpperCase() })} placeholder="APP-000123" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ libelle="Téléphone (activation par SMS)" valeur={f.telephone} onChange={(v) => setF({ ...f, telephone: v })} placeholder="+229 01 97 00 00 00" />
            <Champ libelle="Courriel (facultatif)" valeur={f.courriel} onChange={(v) => setF({ ...f, courriel: v })} placeholder="prenom.nom@exemple.bj" />
          </div>
          {action.error && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{messageErreur(action.error)}</p>}
        </div>
      )}
    </Modale>
  );
}

function DialogueRevocation({ cible, onFermer }: { cible: { id: string; libelle: string } | null; onFermer: () => void }) {
  const action = useActionDelegation();
  const [motif, setMotif] = useState("");
  const fermer = () => { setMotif(""); action.reset(); onFermer(); };
  return (
    <Modale ouvert={!!cible} onFermer={fermer} titre="Révoquer un droit" sousTitre={cible?.libelle} icone={X} ton="critique"
      pied={<><Button variante="secondaire" onClick={fermer}>Annuler</Button>
        <Button variante="danger" chargement={action.isPending} disabled={motif.trim().length < 5}
          onClick={() => action.mutate({ chemin: `/delegation/attributions/${cible!.id}/revoquer`, corps: { motif: motif.trim() } }, { onSuccess: () => { notifier({ ton: "succes", titre: "Droit révoqué", texte: "Les sessions de la personne sont coupées." }); fermer(); } })}>Révoquer</Button></>}>
      <Champ libelle="Motif (journalisé)" valeur={motif} onChange={setMotif} placeholder="Départ de l'établissement" />
      {action.error && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{messageErreur(action.error)}</p>}
    </Modale>
  );
}

/* ------------------------------------------------------------------ Sous-organisations et nominations */

function SousOrganisations({ delegation: d, organisation: org, onOuvrir }: { delegation: MaDelegation; organisation: Organisation; onOuvrir: (o: Organisation) => void }) {
  const [q, setQ] = useState("");
  const liste = useSousOrganisations(org.id, q.trim());
  const [nomination, setNomination] = useState<Organisation | null>(null);
  return (
    <section className="space-y-3" aria-label="Sous-organisations">
      <label className="relative block sm:w-80">
        <span className="sr-only">Rechercher une organisation</span>
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom de l'organisation" className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
      </label>
      {liste.isPending ? <Squelette className="h-40 rounded-2xl" /> : !liste.data?.enfants.length ? (
        <Card><EtatVide icone={Users} titre="Aucune sous-organisation" texte="Cette organisation n'a pas d'échelon inférieur." /></Card>
      ) : (
        <Card className="min-w-0 p-0">
          <ul className="divide-y divide-line/60">
            {liste.data.enfants.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <button type="button" onClick={() => onOuvrir(o)} className="group flex min-w-0 items-center gap-2 text-left">
                  <span className="min-w-0"><span className="block truncate text-[14px] font-medium text-ink group-hover:text-accent-ink">{o.nom}</span>
                    <span className="text-[12px] text-ink-muted">{o.type}{o.enfants ? ` · ${o.enfants} sous-organisation${o.enfants > 1 ? "s" : ""}` : ""}</span></span>
                  <ChevronRight size={15} className="shrink-0 text-ink-muted" aria-hidden />
                </button>
                {d.peutNommer && <Button taille="sm" variante="secondaire" icone={KeyRound} onClick={() => setNomination(o)}>Nommer un administrateur</Button>}
              </li>
            ))}
          </ul>
          {liste.data.enfants.length >= 200 && <p className="border-t border-line/60 px-4 py-2.5 text-[12.5px] text-ink-muted">Seules les 200 premières sont affichées : affinez par le nom.</p>}
        </Card>
      )}
      <DialogueNomination organisation={nomination} delegation={d} onFermer={() => setNomination(null)} />
    </section>
  );
}

function DialogueNomination({ organisation, delegation: d, onFermer }: { organisation: Organisation | null; delegation: MaDelegation; onFermer: () => void }) {
  const [q, setQ] = useState("");
  const candidats = useComptesDelegues(organisation ? d.organisationId : null, q.trim());
  const [profilId, setProfilId] = useState("");
  const [motif, setMotif] = useState("");
  const action = useActionDelegation<{ statut: string }>();
  const fermer = () => { setQ(""); setProfilId(""); setMotif(""); action.reset(); onFermer(); };
  const choix = useMemo(() => (candidats.data ?? []).filter((c) => c.compteId), [candidats.data]);
  return (
    <Modale ouvert={!!organisation} onFermer={fermer} titre="Nommer un administrateur" sousTitre={organisation?.nom} icone={KeyRound}
      pied={<><Button variante="secondaire" onClick={fermer}>Annuler</Button>
        <Button icone={Check} chargement={action.isPending} disabled={!profilId || motif.trim().length < 5}
          onClick={() => action.mutate({ chemin: "/delegation/delegations", corps: { profilId, organisationId: organisation!.id, motif: motif.trim() } }, {
            onSuccess: (r) => { notifier({ ton: "succes", titre: r.statut === "en_attente" ? "Nomination en attente" : "Administrateur nommé", texte: r.statut === "en_attente" ? "Une seconde validation par un niveau supérieur est requise." : "La délégation est active." }); fermer(); },
          })}>Nommer</Button></>}>
      <div className="space-y-3">
        <label className="relative block">
          <span className="text-[13px] font-medium text-ink">Personne (compte existant de votre périmètre)</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher par nom" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[14px]" />
        </label>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {choix.slice(0, 20).map((c) => (
            <li key={c.id}><button type="button" onClick={() => setProfilId(c.id)} className={cn("w-full rounded-md px-3 py-2 text-left text-[13.5px]", profilId === c.id ? "bg-blue-soft font-semibold text-accent-ink" : "hover:bg-surface-2")}>{c.nomAffiche} <span className="text-ink-muted">· {c.identifiant}</span></button></li>
          ))}
        </ul>
        <Champ libelle="Motif (journalisé)" valeur={motif} onChange={setMotif} placeholder="Administrateur de l'établissement" />
        {action.error && <p role="alert" className="rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{messageErreur(action.error)}</p>}
      </div>
    </Modale>
  );
}

function AValider() {
  const liste = useNominationsAValider();
  const action = useActionDelegation<{ statut: string }>();
  const decider = (id: string, decision: "valider" | "refuser") => action.mutate({ chemin: `/delegation/delegations/${id}/${decision}` }, {
    onSuccess: (r) => notifier({ ton: "succes", titre: r.statut === "active" ? "Nomination validée" : "Nomination refusée", texte: "La décision est journalisée." }),
    onError: (e) => notifier({ ton: "critique", titre: "Décision refusée", texte: messageErreur(e) }),
  });
  if (liste.isPending) return <Squelette className="h-32 rounded-2xl" />;
  if (!liste.data?.length) return <Card><EtatVide icone={Check} titre="Rien à valider" texte="Les nominations d'administrateurs en attente de votre seconde validation apparaîtront ici." /></Card>;
  return (
    <div className="space-y-2.5">
      {liste.data.map((n) => (
        <Card key={n.id} className="min-w-0 p-4">
          <p className="font-semibold text-ink">{n.beneficiaire}</p>
          <p className="text-[13px] text-ink-2">{LIBELLE_NIVEAU[n.niveau]} · {n.organisation}</p>
          <p className="mt-1 text-[12.5px] text-ink-muted">Demandée par {n.demandeur ?? "—"}{n.motif ? ` · « ${n.motif} »` : ""}</p>
          <div className="mt-3 flex gap-2">
            <Button taille="sm" variante="valider" icone={Check} onClick={() => decider(n.id, "valider")} chargement={action.isPending}>Valider</Button>
            <Button taille="sm" variante="danger" icone={X} onClick={() => decider(n.id, "refuser")} disabled={action.isPending}>Refuser</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Champ({ libelle, valeur, onChange, placeholder }: { libelle: string; valeur: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block text-[13px] font-medium text-ink">{libelle}
      <input value={valeur} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1.5 h-10 w-full rounded-lg border border-line bg-bg px-3 text-[14px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
    </label>
  );
}
