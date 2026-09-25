"use client";

import { AlertTriangle, Award, BadgeCheck, BookOpen, Briefcase, CalendarDays, Clock, GraduationCap, IdCard, Layers, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { Cascade, Compteur, Element, EntreePage, motion } from "@/components/motion";
import { Badge, Button, Card, CardHeader, EtatVide, Etiquette, PageHeader, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { date, nombre } from "@/lib/format";
import { useCarriere, useInscriptionFormation, useSynchronisationEnseignant, type Carriere } from "@/lib/api/enseignant";
import { BadgePoint, Erreur, FeuilleModale, LIBELLE_FORMATION, TON_FORMATION, type StatutFormation } from "../communs";

const statutFormation = (s: string | null): StatutFormation => (s === "validee" ? "validee" : s === "inscrit" ? "inscrit" : s ? "en_cours" : "a_faire");

/** Années d'ancienneté depuis une date AAAA-MM-JJ. */
const anciennete = (depuis: string) => Math.max(0, (Date.now() - new Date(depuis).getTime()) / (365.25 * 86_400_000));

export default function PageCarriere() {
  useSynchronisationEnseignant();
  const { data, isPending, error, refetch, isRefetching } = useCarriere();

  if (isPending) return <Chargement />;
  if (!data) return <Erreur erreur={error!} relancer={() => refetch()} enCours={isRefetching} titre="Impossible de charger votre parcours" />;

  const e = data.enseignant;
  const obligatoire = data.catalogue.find((f) => f.obligatoire && !f.statut);
  const validees = data.formations.filter((f) => f.statut === "validee").length;

  return (
    <EntreePage>
      <div className="space-y-6">
        <PageHeader
          surtitre="Passeport professionnel"
          titre={`${e.prenoms} ${e.nom}`}
          sousTitre="Votre carrière se reconstitue à partir des événements du registre : aucun dossier papier à recomposer lors d'une mutation."
        />

        {obligatoire && <AlerteObligatoire formation={obligatoire} />}

        <Cascade className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Element><Tuile libelle="Grade" icone={IdCard} valeur={e.grade} indication={`Identifiant ${e.id}`} /></Element>
          <Element><Tuile libelle="Ancienneté" icone={CalendarDays} nombreValeur={anciennete(e.dateRecrutement)} suffixe=" ans" indication={`Recruté le ${date(e.dateRecrutement)}`} /></Element>
          <Element><Tuile libelle="Charge" icone={Layers} nombreValeur={data.charge.classes} suffixe={` classe${data.charge.classes > 1 ? "s" : ""}`} indication={`${data.charge.enseignements} enseignement${data.charge.enseignements > 1 ? "s" : ""} · ${e.matieres.join(", ")}`} /></Element>
          <Element><Tuile libelle="Validées" icone={Award} nombreValeur={validees} indication={`formations · ${data.formations.length} au total`} /></Element>
        </Cascade>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="min-w-0 space-y-6 lg:col-span-2">
            <Affectations data={data} />
          </div>
          <div className="min-w-0 space-y-6 lg:col-span-3">
            <Catalogue data={data} />
            <Parcours data={data} />
          </div>
        </div>
      </div>
    </EntreePage>
  );
}

/* ------------------------------------------------------------------ Tuiles */

function Tuile({ libelle, icone: Icone, valeur, nombreValeur, suffixe = "", indication }: { libelle: string; icone: typeof Award; valeur?: string; nombreValeur?: number; suffixe?: string; indication?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line/70 bg-surface p-4 shadow-float">
      <div className="flex items-start justify-between gap-2"><Etiquette className="truncate">{libelle}</Etiquette><Icone size={16} className="text-ink-muted" aria-hidden /></div>
      <p className={cn("mt-2 font-semibold tabular-nums text-ink", valeur ? "line-clamp-2 text-[17px] leading-snug" : "truncate text-2xl")}>
        {valeur ?? <Compteur valeur={nombreValeur ?? 0} format={(n) => `${nombre(n, suffixe === " ans" ? 1 : 0)}${suffixe}`} />}
      </p>
      {indication && <p className="mt-0.5 truncate text-xs text-ink-muted">{indication}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Formation obligatoire mise en avant */

function AlerteObligatoire({ formation: f }: { formation: Carriere["catalogue"][number] }) {
  const inscription = useInscriptionFormation();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-xl border border-warning/40 bg-warning-bg p-4 sm:p-5">
      <motion.span className="absolute inset-y-0 left-0 w-1 bg-warning" initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.2, duration: 0.5 }} aria-hidden />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-warning text-white"><AlertTriangle size={20} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-warning">Formation obligatoire cette année</p>
          <p className="mt-0.5 text-[15.5px] font-semibold text-ink">{f.intitule}</p>
          <p className="text-[13px] text-ink-2">{f.duree} · {f.modalite} · vous n'êtes pas encore inscrit.</p>
        </div>
        <Button icone={Plus} chargement={inscription.isPending} onClick={() => inscription.mutate({ code: f.code, intitule: f.intitule })} className="h-12 w-full sm:w-auto">M'inscrire</Button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ Catalogue */

function Catalogue({ data }: { data: Carriere }) {
  const inscription = useInscriptionFormation();
  const [confirmer, setConfirmer] = useState<Carriere["catalogue"][number] | null>(null);
  const catalogue = [...data.catalogue].sort((a, b) => Number(b.obligatoire) - Number(a.obligatoire));
  return (
    <Card className="min-w-0">
      <CardHeader icon={BookOpen} title="Catalogue de formation continue" subtitle="Formations ouvertes à l'inscription pour l'année en cours" />
      {catalogue.length === 0 ? (
        <EtatVide icone={BookOpen} titre="Aucune formation ouverte" texte="Le catalogue de l'année n'est pas encore publié." />
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {catalogue.map((f, i) => {
            const s = statutFormation(f.statut);
            return (
              <motion.li key={f.code} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.05 }}
                className={cn("flex min-w-0 flex-col rounded-xl border p-3.5", f.obligatoire ? "border-warning/40 bg-warning-bg/40" : "border-line/70")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold leading-snug text-ink">{f.intitule}</p>
                  {f.obligatoire && <Badge ton="avertissement">Obligatoire</Badge>}
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden />{f.duree}</span>
                  <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden />{f.modalite}</span>
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                  <BadgePoint ton={TON_FORMATION[s]}>{LIBELLE_FORMATION[s]}</BadgePoint>
                  {s === "a_faire" && (
                    <Button taille="sm" variante={f.obligatoire ? "primaire" : "secondaire"} icone={Plus} className="h-10 sm:h-8"
                      chargement={inscription.isPending && inscription.variables?.code === f.code}
                      onClick={() => setConfirmer(f)}>S'inscrire</Button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
      <FeuilleModale
        ouverte={!!confirmer}
        fermer={() => setConfirmer(null)}
        titre="Confirmer l'inscription"
        sousTitre={confirmer?.intitule}
        pied={<>
          <Button variante="secondaire" onClick={() => setConfirmer(null)}>Annuler</Button>
          <Button icone={BadgeCheck} chargement={inscription.isPending} onClick={() => confirmer && inscription.mutate({ code: confirmer.code, intitule: confirmer.intitule }, { onSettled: () => setConfirmer(null) })}>M'inscrire</Button>
        </>}
      >
        {confirmer && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-surface-2/70 p-3"><dt className="text-xs text-ink-muted">Durée</dt><dd className="mt-0.5 font-medium text-ink">{confirmer.duree}</dd></div>
            <div className="rounded-lg bg-surface-2/70 p-3"><dt className="text-xs text-ink-muted">Modalité</dt><dd className="mt-0.5 font-medium text-ink">{confirmer.modalite}</dd></div>
            <p className="col-span-2 text-xs text-ink-muted">L'inscription est enregistrée à votre dossier professionnel et visible de votre chef d'établissement. Elle ne peut être faite qu'une fois.</p>
          </dl>
        )}
      </FeuilleModale>
    </Card>
  );
}

/* ------------------------------------------------------------------ Affectations */

function Affectations({ data }: { data: Carriere }) {
  const liste = [...data.affectations].sort((a, b) => b.valideDu.localeCompare(a.valideDu));
  return (
    <Card className="min-w-0">
      <CardHeader icon={Briefcase} title="Affectations" subtitle="Postes successifs, datés au registre" />
      {liste.length === 0 ? (
        <EtatVide icone={Briefcase} titre="Aucune affectation enregistrée" />
      ) : (
        <ul className="space-y-2.5">
          {liste.map((a) => {
            const enCours = !a.valideAu;
            return (
              <li key={a.id} className={cn("rounded-xl border p-3.5", enCours ? "border-[color:var(--acc)]/40 bg-[var(--acc-doux)]" : "border-line/70")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[14px] font-semibold text-ink">{a.etablissement}</p>
                  <BadgePoint ton={enCours ? "succes" : "neutre"}>{enCours ? "En poste" : "Terminée"}</BadgePoint>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">{a.fonction}</p>
                <p className="mt-1 text-xs text-ink-muted">Depuis le {date(a.valideDu)}{a.valideAu ? ` jusqu'au ${date(a.valideAu)}` : ""}</p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ Parcours (frise) */

function Parcours({ data }: { data: Carriere }) {
  const e = data.enseignant;
  const jalons = [
    ...data.formations.map((f) => ({ id: f.id, date: f.le, titre: f.formation, statut: statutFormation(f.statut), icone: f.statut === "validee" ? Award : BookOpen, detail: f.statut === "validee" ? "Formation validée" : "Inscription enregistrée" })),
    ...data.affectations.map((a) => ({ id: a.id, date: `${a.valideDu}T08:00:00.000Z`, titre: `Affectation · ${a.etablissement}`, statut: null, icone: Briefcase, detail: a.fonction })),
    { id: "recrutement", date: `${e.dateRecrutement}T08:00:00.000Z`, titre: "Recrutement", statut: null, icone: GraduationCap, detail: e.grade },
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card className="min-w-0">
      <CardHeader icon={GraduationCap} title="Parcours professionnel" subtitle="Chaque jalon est un événement horodaté du registre" />
      <ol className="relative ml-4 border-l border-line pl-6">
        {jalons.map((j, i) => (
          <motion.li key={j.id} initial={{ opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 12) * 0.05 }} className="relative pb-5 last:pb-0">
            <span className="absolute -left-[39px] flex h-7 w-7 items-center justify-center rounded-full bg-surface ring-2 ring-line" style={{ color: "var(--acc)" }}><j.icone size={14} aria-hidden /></span>
            <p className="text-xs text-ink-muted">{date(j.date)}</p>
            <p className="text-[14px] font-semibold text-ink">{j.titre}</p>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">{j.detail}{j.statut && <BadgePoint ton={TON_FORMATION[j.statut]}>{LIBELLE_FORMATION[j.statut]}</BadgePoint>}</p>
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}

function Chargement() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement du parcours">
      <div className="space-y-2"><Squelette className="h-3 w-40" /><Squelette className="h-8 w-64" /><Squelette className="h-4 w-full max-w-xl" /></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Squelette key={i} className="h-24 rounded-xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-5"><Squelette className="h-64 rounded-xl lg:col-span-2" /><Squelette className="h-96 rounded-xl lg:col-span-3" /></div>
    </div>
  );
}
