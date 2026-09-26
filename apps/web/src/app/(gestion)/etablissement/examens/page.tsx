"use client";

import { Award, BadgeCheck, ClipboardList, ExternalLink, Gavel, GraduationCap, Info, Lock, QrCode, ScanLine, ShieldAlert, Sigma, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { TuileIndicateur } from "@/components/ui/donnees";
import { notifier } from "@/components/ui/Notifications";
import { CartePreuve, cheminVerification } from "@/components/ui/Preuve";
import { Badge, Button, Card, CardHeader, EtatVide, PageHeader, Segmente, Squelette } from "@/components/ui/primitives";
import { useDeliberationMutation, useExamens, type ExamenCertifiable, type Examens } from "@/lib/api/etablissement";
import { cn } from "@/lib/cn";
import { entier, nombre } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useEtablissementCourant } from "@/lib/session";
import { ChampRecherche, classeChamp, dateCourte, Dialogue, EtatErreur, HorsPerimetre, normaliser, Statut } from "../_composants";

const MOT_CONFIRMATION = "DÉLIBÉRER";
type FiltreExamen = "tous" | "CEP" | "BEPC" | "BAC";
const LIBELLE_EXAMEN = { CEP: "Certificat d'études primaires", BEPC: "Brevet d'études du premier cycle", BAC: "Baccalauréat" } as const;
const OPTIONS_EXAMEN: { valeur: ExamenCertifiable; libelle: string }[] = [{ valeur: "CEP", libelle: "CEP" }, { valeur: "BEPC", libelle: "BEPC" }, { valeur: "BAC", libelle: "BAC" }];

export default function Page() {
  const id = useEtablissementCourant();
  return <EntreePage>{id ? <PageExamens id={id} /> : <HorsPerimetre />}</EntreePage>;
}

function PageExamens({ id }: { id: string }) {
  const [examen, setExamen] = useState<ExamenCertifiable>("BEPC");
  const examens = useExamens(id, examen);
  const x = examens.data;

  return (
    <div className="space-y-5">
      <PageHeader
        surtitre="Processus P8"
        titre="Examens et certification"
        sousTitre="Candidatures constituées à partir du référentiel des apprenants, sans ressaisie ; résultats inscrits au registre ; diplômes vérifiables par un tiers en quelques secondes."
        actions={<Link href="/verifier" className="inline-flex h-10 items-center gap-2 rounded-md bg-surface px-4 text-sm font-medium text-ink ring-1 ring-inset ring-line transition-all hover:bg-surface-2 active:scale-[0.97]"><ScanLine size={16} aria-hidden /> Page publique de vérification</Link>}
      />

      <div className="overflow-x-auto"><Segmente label="Examen national" valeur={examen} onChange={setExamen} options={OPTIONS_EXAMEN} /></div>

      {examens.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Squelette key={i} className="h-[104px] rounded-lg" />)}</div>
          <div className="grid gap-6 lg:grid-cols-3"><Squelette className="h-96 lg:col-span-2" /><Squelette className="h-72" /></div>
        </>
      ) : examens.isError ? (
        <Card><EtatErreur erreur={examens.error} reessayer={() => examens.refetch()} /></Card>
      ) : (
        <Contenu id={id} x={x!} />
      )}
    </div>
  );
}

function Contenu({ id, x }: { id: string; x: Examens }) {
  const diplomesExamen = x.certificats.filter((c) => c.examen === x.examen && c.session === x.session);
  const moyennes = x.candidats.map((c) => c.moyenne).filter((v): v is number => v != null);
  const moyenne = moyennes.length ? moyennes.reduce((s, v) => s + v, 0) / moyennes.length : null;
  const auDessus = moyennes.filter((v) => v >= 10).length;

  return (
    <>
      <Cascade data-guide="examens-indicateurs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Element><TuileIndicateur libelle={`Candidats ${x.examen}`} icone={Users} accent="bleu" valeur={<Compteur valeur={x.candidats.length} format={entier} />} indice={x.classes.length ? `classe${x.classes.length > 1 ? "s" : ""} ${x.classes.join(", ")}` : `aucune classe de ${x.niveau}`} /></Element>
        <Element><TuileIndicateur libelle="Moyenne annuelle" icone={Sigma} accent="ambre" valeur={moyenne != null ? <Compteur valeur={moyenne} format={(v) => nombre(v, 2)} /> : "—"} unite="/20" indice="base provisoire de la décision" /></Element>
        <Element><TuileIndicateur libelle="Moyenne ≥ 10" icone={GraduationCap} accent="sarcelle" valeur={<Compteur valeur={auDessus} format={entier} />} indice={x.candidats.length ? `${nombre((auDessus / x.candidats.length) * 100, 0)} % des candidats` : undefined} /></Element>
        <Element><TuileIndicateur libelle="Diplômes rattachés" icone={Award} accent="bleu" valeur={<Compteur valeur={x.certificats.length} format={entier} />} indice={`dont ${diplomesExamen.length} ${x.examen} ${x.session}`} /></Element>
      </Cascade>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><Candidats x={x} /></div>
        <div className="min-w-0"><Deliberation id={id} x={x} diplomes={diplomesExamen.length} /></div>
      </div>

      <Certificats x={x} />
    </>
  );
}

/* ================================================================== Candidats */

function Candidats({ x }: { x: Examens }) {
  const [q, setQ] = useState("");
  const [tout, setTout] = useState(false);
  const liste = useMemo(() => {
    const n = normaliser(q);
    return x.candidats.filter((c) => !n || normaliser(`${c.nom} ${c.id}`).includes(n));
  }, [x.candidats, q]);
  const visibles = tout ? liste : liste.slice(0, 12);

  return (
    <Card data-guide="examens-candidats" className="min-w-0 overflow-hidden p-0">
      <div className="px-5 pt-5">
        <CardHeader icon={ClipboardList} title={`${x.examen} · session ${x.session}`} subtitle={`Candidatures constituées depuis les classes de ${x.niveau}`}
          action={x.deliberee ? <Statut ton="succes">Délibérée</Statut> : <Statut ton="info">Candidatures ouvertes</Statut>} />
        <p className="mb-4 flex items-start gap-2 rounded-md bg-info-bg px-3 py-2 text-xs text-info"><Info size={14} className="mt-0.5 shrink-0" aria-hidden /> La note affichée est la <strong className="font-semibold">moyenne annuelle</strong> de l'apprenant : elle sert de base provisoire tant que le centre d'examen n'a pas transmis la note officielle de l'épreuve. Un candidat sans moyenne enregistrée ne sera pas jugé.</p>
        <ChampRecherche valeur={q} onChange={setQ} placeholder="Rechercher un candidat" label="Rechercher un candidat" className="mb-4" />
      </div>
      {x.candidats.length === 0 ? (
        <EtatVide icone={Users} titre="Aucun candidat" texte={`Aucun apprenant n'est scolarisé en classe de ${x.niveau} cette année.`} />
      ) : liste.length === 0 ? (
        <EtatVide icone={Users} titre="Aucun candidat trouvé" texte="Aucun candidat ne correspond à cette recherche." />
      ) : (
        <>
          {/* Cartes sous md */}
          <ul className="grid gap-2 px-5 pb-4 sm:grid-cols-2 md:hidden">
            {visibles.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg border border-line/70 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/etablissement/eleves/${c.id}`} className="block truncate text-sm font-medium text-ink hover:text-blue">{c.nom}</Link>
                  <p className="font-mono text-xs text-ink-muted">{c.id} · {c.classe}</p>
                </div>
                <span className={cn("text-sm font-semibold tabular", c.moyenne != null && c.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(c.moyenne, 2)}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-5 py-2.5 font-semibold">Candidat</th><th className="px-5 py-2.5 font-semibold">Classe</th><th className="px-5 py-2.5 text-right font-semibold">Moyenne annuelle</th></tr>
              </thead>
              <tbody>
                {visibles.map((c, i) => (
                  <motion.tr key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.035 }} className="border-t border-line/60 hover:bg-surface-2/50">
                    <td className="px-5 py-3"><Link href={`/etablissement/eleves/${c.id}`} className="font-medium text-ink hover:text-blue hover:underline">{c.nom}</Link><span className="block font-mono text-xs text-ink-muted">{c.id}</span></td>
                    <td className="px-5 py-3 text-ink-2">{c.classe}</td>
                    <td className={cn("px-5 py-3 text-right font-medium", c.moyenne != null && c.moyenne < 10 ? "text-critical" : "text-ink")}>{nombre(c.moyenne, 2)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {liste.length > 12 && (
            <div className="border-t border-line/60 px-5 py-2.5">
              <button type="button" onClick={() => setTout((t) => !t)} className="min-h-10 text-[13px] font-medium text-blue hover:underline">{tout ? "Réduire" : `Afficher les ${liste.length} candidats`}</button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ================================================================== Délibération */

function Deliberation({ id, x, diplomes }: { id: string; x: Examens; diplomes: number }) {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const deliberer = useDeliberationMutation(id);
  const erreur = deliberer.error instanceof ErreurApi ? deliberer.error : null;
  const confirme = saisie.trim().toUpperCase() === MOT_CONFIRMATION;
  const nonJuges = x.candidats.filter((c) => c.moyenne == null).length;

  const fermer = () => { if (deliberer.isPending) return; setOuvert(false); setSaisie(""); };
  const lancer = () => deliberer.mutate({ examen: x.examen, session: x.session }, {
    onSuccess: (r) => {
      setOuvert(false);
      setSaisie("");
      notifier({ ton: "succes", titre: "Délibération enregistrée", texte: `${r.examen} ${r.session} · ${r.candidats} candidats, ${r.diplomes} diplôme${r.diplomes > 1 ? "s" : ""} délivré${r.diplomes > 1 ? "s" : ""}${r.nonJuges ? `, ${r.nonJuges} non jugé${r.nonJuges > 1 ? "s" : ""} (sans moyenne)` : ""} — note provisoire, en attente des notes du centre.` });
    },
    onError: (e) => { if (e instanceof ErreurApi && e.statut === 409) setOuvert(false); },
  });

  return (
    <Card data-guide="examens-deliberation" className="min-w-0">
      <CardHeader icon={Gavel} title="Délibération" subtitle="Déléguée au centre d'examen : résultats et diplômes, en une transaction" />
      {x.deliberee ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <p className="flex items-start gap-2 rounded-md bg-success-bg px-3 py-2.5 text-[13px] font-medium text-success"><BadgeCheck size={16} className="mt-0.5 shrink-0" aria-hidden /> {x.examen} {x.session} délibéré : {diplomes} diplôme{diplomes > 1 ? "s" : ""} délivré{diplomes > 1 ? "s" : ""}, chacun vérifiable par QR code.</p>
          <p className="flex items-start gap-2 text-xs text-ink-muted"><Lock size={13} className="mt-0.5 shrink-0" aria-hidden /> Une délibération est définitive : toute correction ultérieure (notamment l'arrivée des notes officielles du centre) passe par un événement correctif journalisé avec son auteur.</p>
        </motion.div>
      ) : (
        <>
          <p className="text-[13px] text-ink-2">Les résultats sont inscrits au registre sur la base de la <strong className="text-ink">moyenne annuelle</strong> (provisoire, en attendant les notes du centre) ; chaque admis reçoit un diplôme avec identifiant et empreinte. L'opération est <strong className="text-ink">irréversible</strong>.</p>
          {nonJuges > 0 && <p className="mt-2 flex items-start gap-2 text-xs text-ink-muted"><Info size={13} className="mt-0.5 shrink-0" aria-hidden /> {nonJuges} candidat{nonJuges > 1 ? "s" : ""} sans moyenne annuelle ne sera{nonJuges > 1 ? "ont" : ""} pas jugé{nonJuges > 1 ? "s" : ""}.</p>}
          {erreur && erreur.statut !== 409 && <p role="alert" className="mt-3 rounded-md bg-critical-bg px-3 py-2 text-[13px] text-critical">{erreur.message}</p>}
          {erreur?.statut === 409 && <p role="status" className="mt-3 rounded-md bg-info-bg px-3 py-2 text-[13px] text-info">Cette session a déjà été délibérée (par un autre poste) : l'écran vient d'être actualisé.</p>}
          <Button className="mt-4 w-full" variante="valider" icone={Gavel} disabled={!x.candidats.length} onClick={() => setOuvert(true)}>Délibérer et délivrer les diplômes</Button>
        </>
      )}

      <Dialogue
        ouvert={ouvert}
        onFermer={fermer}
        ton="danger"
        icone={ShieldAlert}
        titre={`Délibérer ${x.examen} · session ${x.session}`}
        description="Action définitive : les résultats de tous les candidats jugés seront inscrits au registre et les diplômes délivrés. Elle ne peut être ni annulée ni rejouée."
        pied={
          <>
            <Button variante="secondaire" onClick={fermer} disabled={deliberer.isPending}>Annuler</Button>
            <Button variante="danger" icone={Gavel} disabled={!confirme} chargement={deliberer.isPending} onClick={lancer}>Délibérer définitivement</Button>
          </>
        }
      >
        <div className="space-y-4">
          <ul className="grid grid-cols-2 gap-2 text-[13px]">
            <li className="rounded-md bg-surface-2/70 px-3 py-2"><span className="block text-xs text-ink-muted">Candidats jugés</span><span className="font-semibold tabular text-ink">{x.candidats.length - nonJuges}</span></li>
            <li className="rounded-md bg-surface-2/70 px-3 py-2"><span className="block text-xs text-ink-muted">Classes</span><span className="font-semibold text-ink">{x.classes.join(", ") || "—"}</span></li>
          </ul>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink">Pour confirmer, saisissez <span className="font-mono font-bold text-critical">{MOT_CONFIRMATION}</span></span>
            <input value={saisie} onChange={(e) => setSaisie(e.target.value.slice(0, 20))} className={cn(classeChamp, "font-mono uppercase")} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={!!saisie && !confirme} />
          </label>
        </div>
      </Dialogue>
    </Card>
  );
}

/* ================================================================== Certificats */

function Certificats({ x }: { x: Examens }) {
  const [filtre, setFiltre] = useState<FiltreExamen>("tous");
  const [q, setQ] = useState("");
  const [apercu, setApercu] = useState<string | null>(null);
  const presents = useMemo(() => new Set(x.certificats.map((c) => c.examen)), [x.certificats]);
  const liste = useMemo(() => {
    const n = normaliser(q);
    return x.certificats.filter((c) => (filtre === "tous" || c.examen === filtre) && (!n || normaliser(`${c.titulaire} ${c.id}`).includes(n)));
  }, [x.certificats, filtre, q]);
  const choisi = x.certificats.find((c) => c.id === apercu) ?? null;
  const options = [{ valeur: "tous" as const, libelle: `Tous (${x.certificats.length})` }, ...(["CEP", "BEPC", "BAC"] as const).filter((e) => presents.has(e)).map((e) => ({ valeur: e, libelle: e }))];

  return (
    <Card data-guide="examens-diplomes" className="min-w-0 overflow-hidden p-0">
      <div className="space-y-4 px-5 pt-5">
        <CardHeader className="mb-0" icon={Award} title="Diplômes délivrés" subtitle="Rattachés à l'identifiant de chaque apprenant passé par l'établissement ; contrôlables sans compte ni démarche" action={<Badge>{x.certificats.length}</Badge>} />
        <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="-mx-1 overflow-x-auto px-1"><Segmente label="Examen" valeur={filtre} onChange={setFiltre} options={options} /></div>
          <ChampRecherche valeur={q} onChange={setQ} placeholder="Titulaire ou identifiant du diplôme" label="Rechercher un diplôme" />
        </div>
      </div>
      {liste.length === 0 ? (
        <EtatVide icone={Award} titre="Aucun diplôme" texte={x.certificats.length ? "Aucun diplôme ne correspond à ces critères." : "Les diplômes (CEP, BEPC) des apprenants de l'établissement apparaîtront ici."} />
      ) : (
        <ul className="mt-4 divide-y divide-line/60 border-t border-line/60">
          {liste.slice(0, 60).map((c, i) => (
            <motion.li key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.035 }}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 hover:bg-surface-2/40">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", c.revoque ? "bg-critical-bg text-critical" : "bg-warning-bg text-warning")}><Award size={17} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{c.titulaire}</p>
                <p className="truncate text-xs text-ink-muted"><span title={LIBELLE_EXAMEN[c.examen]}>{c.examen}</span> {c.session} · {c.mention} · <span className="tabular">{nombre(c.moyenne, 2)}/20</span> · délivré le {dateCourte(c.delivreLe)}</p>
              </div>
              {c.revoque && <Statut ton="critique">Révoqué</Statut>}
              <div className="ml-12 flex gap-1.5 sm:ml-0">
                <Button variante="fantome" taille="sm" icone={QrCode} onClick={() => setApercu(c.id)}>Attestation</Button>
                <Link href={cheminVerification(c)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-blue transition-all hover:bg-blue-soft/50 active:scale-[0.97]">Vérifier <ExternalLink size={12} aria-hidden /></Link>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
      {liste.length > 60 && <p className="border-t border-line/60 px-5 py-3 text-xs text-ink-muted">60 premiers diplômes affichés sur {liste.length} : affinez la recherche.</p>}

      <Dialogue ouvert={!!choisi} onFermer={() => setApercu(null)} icone={BadgeCheck} ton="succes" titre="Attestation numérique" description="Le QR code renvoie à la page publique de vérification : identifiant et empreinte du diplôme." large>
        {choisi && <CartePreuve certificat={choisi} titulaire={choisi.titulaire} />}
      </Dialogue>
    </Card>
  );
}
