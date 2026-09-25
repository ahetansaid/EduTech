"use client";

import { ArrowLeft, ArrowRight, BookOpen, Building2, Droplets, Lightbulb, MapPin, School, Toilet, Wifi } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { PagePublique } from "@/components/public/CadrePublic";
import { Cascade, Element } from "@/components/motion";
import { CarteBenin } from "@/components/map/CarteBenin";
import { EtatVide, Squelette } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { STATUTS, useFiche } from "@/lib/api/public";
import { ErreurApi } from "@/lib/http";

const EQUIPEMENTS = [
  { cle: "eau", libelle: "Eau potable", icone: Droplets },
  { cle: "electricite", libelle: "Électricité", icone: Lightbulb },
  { cle: "latrines", libelle: "Latrines", icone: Toilet },
  { cle: "bibliotheque", libelle: "Bibliothèque", icone: BookOpen },
  { cle: "internet", libelle: "Internet", icone: Wifi },
] as const;

export default function FicheEtablissement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: e, isPending, error, refetch } = useFiche(decodeURIComponent(id));

  if (error) {
    const introuvable = error instanceof ErreurApi && error.statut === 404;
    return (
      <PagePublique surtitre="Établissement" titre={introuvable ? "Établissement introuvable" : "Fiche indisponible"}>
        <EtatVide icone={School} titre={introuvable ? "Cet identifiant ne correspond à aucun établissement." : "La fiche n'a pas pu être chargée."}
          action={introuvable ? <Link href="/etablissements" className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Rechercher un établissement</Link>
            : <button onClick={() => refetch()} className="rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white">Réessayer</button>} />
      </PagePublique>
    );
  }
  if (isPending || !e) {
    return (
      <PagePublique surtitre="Établissement" titre={<Squelette className="h-10 w-80 max-w-full" />}>
        <div className="grid gap-4 md:grid-cols-2"><Squelette className="h-56 rounded-2xl" /><Squelette className="h-56 rounded-2xl" /></div>
      </PagePublique>
    );
  }

  return (
    <PagePublique large surtitre={`${e.typeLibelle} · ${STATUTS[e.statut]}`} titre={e.nom}
      intro={<span className="inline-flex items-center gap-1.5"><MapPin size={16} aria-hidden /> {e.commune}{e.departement ? `, ${e.departement}` : ""} · {e.circonscription}</span>}>
      <Link href="/etablissements" className="-mt-4 mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-accent-ink hover:underline"><ArrowLeft size={15} /> Tous les établissements</Link>
      <Cascade className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Element className="min-w-0">
          <div className="space-y-5">
            <section className="rounded-2xl border border-line/70 bg-surface p-5 shadow-float">
              <h2 className="text-[15px] font-semibold text-ink">L'établissement</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4">
                <Info libelle="Type" valeur={e.typeLibelle} />
                <Info libelle="Statut" valeur={STATUTS[e.statut]} />
                <Info libelle="Capacité d'accueil" valeur={`${e.capacite.toLocaleString("fr-FR")} élèves`} />
                <Info libelle="Salles de classe" valeur={String(e.salles)} />
                {e.gestionnaire && <Info libelle="Gestionnaire" valeur={e.gestionnaire} />}
                <Info libelle="Circonscription" valeur={e.circonscription} />
              </dl>
            </section>
            <section className="rounded-2xl border border-line/70 bg-surface p-5 shadow-float">
              <h2 className="text-[15px] font-semibold text-ink">Équipements</h2>
              <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {EQUIPEMENTS.map((q) => {
                  const present = e.infrastructures[q.cle];
                  return (
                    <li key={q.cle} className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium", present ? "bg-success-bg text-success" : "bg-surface-2 text-ink-muted line-through decoration-1")}>
                      <q.icone size={16} aria-hidden /> {q.libelle}
                      <span className="sr-only">{present ? "disponible" : "non disponible"}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <Link href="/inscription-scolaire" className="group flex items-center gap-4 rounded-2xl bg-navy p-5 text-white shadow-float transition hover:bg-navy-deep">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><Building2 size={20} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[16px] font-bold">Inscrire son enfant</span>
                <span className="block text-[13px] text-white/75">Pièces à fournir et étapes, y compris sans acte de naissance.</span>
              </span>
              <ArrowRight size={18} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </div>
        </Element>
        <Element className="min-w-0">
          <section className="overflow-hidden rounded-2xl border border-line/70 bg-surface p-3 shadow-float">
            <CarteBenin niveau="communes" focusDepartement={e.departementId ?? undefined} selection={e.communeId}
              points={e.lat != null && e.lng != null ? [{ id: e.id, lat: e.lat, lng: e.lng, libelle: e.nom, mis: true }] : []} hauteur={440} className="w-full" />
            <p className="px-1 pb-1 pt-2 text-[12px] text-ink-muted">Localisation de l'établissement dans son département.</p>
          </section>
        </Element>
      </Cascade>
    </PagePublique>
  );
}

function Info({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{libelle}</dt>
      <dd className="mt-1 text-[14.5px] font-medium text-ink">{valeur}</dd>
    </div>
  );
}
