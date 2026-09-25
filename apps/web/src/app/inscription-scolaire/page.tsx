"use client";

import { ArrowRight, Baby, CheckCircle2, FileCheck2, Fingerprint, School, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { PagePublique } from "@/components/public/CadrePublic";
import { Cascade, Element } from "@/components/motion";

const ETAPES = [
  { icone: School, titre: "Choisissez l'établissement", texte: "Trouvez les écoles proches de chez vous, leur niveau et leur capacité d'accueil.", lien: { href: "/etablissements", libelle: "Trouver un établissement" } },
  { icone: FileCheck2, titre: "Présentez-vous à l'établissement", texte: "Avec l'enfant, un document d'identité du responsable et les pièces demandées par l'établissement (voir ci-dessous)." },
  { icone: Fingerprint, titre: "La direction vérifie l'identité", texte: "L'enfant est rattaché à son numéro personnel d'identification (NPI) au registre national : ses résultats le suivront d'une école à l'autre, sans ressaisie." },
  { icone: Smartphone, titre: "Suivez la scolarité", texte: "Le responsable légal accède à l'espace famille : absences, notes, bulletins et notifications, depuis un téléphone." },
];

const PIECES = [
  "Acte de naissance de l'enfant, ou son NPI",
  "Pièce d'identité du parent ou du responsable légal",
  "Pour un changement d'école : le dernier bulletin (le dossier de l'élève suit déjà sur la plateforme)",
];

export default function PageInscription() {
  return (
    <PagePublique surtitre="Démarche" titre="Inscrire son enfant" intro="L'inscription se fait dans l'établissement. La plateforme garantit ensuite que le parcours de l'enfant le suit partout, sans perte ni ressaisie.">
      <Cascade className="space-y-3">
        {ETAPES.map((e, i) => (
          <Element key={e.titre}>
            <div className="flex gap-4 rounded-2xl border border-line/70 bg-surface p-5 shadow-float">
              <div className="flex flex-col items-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-soft text-accent-ink"><e.icone size={20} aria-hidden /></span>
                {i < ETAPES.length - 1 && <span className="mt-2 w-px flex-1 bg-line" aria-hidden />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">Étape {i + 1}</p>
                <h2 className="mt-0.5 font-display text-[17px] font-bold text-ink">{e.titre}</h2>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{e.texte}</p>
                {e.lien && <Link href={e.lien.href} className="mt-2 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-accent-ink hover:underline">{e.lien.libelle} <ArrowRight size={15} /></Link>}
              </div>
            </div>
          </Element>
        ))}
      </Cascade>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line/70 bg-surface p-6 shadow-float">
          <h2 className="font-display text-[17px] font-bold text-ink">Pièces habituellement demandées</h2>
          <ul className="mt-4 space-y-2.5">
            {PIECES.map((p) => <li key={p} className="flex gap-2.5 text-[14.5px] text-ink-2"><CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden /> {p}</li>)}
          </ul>
          <p className="mt-4 rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
            La liste officielle et les éventuels frais sont fixés par le ministère et l'établissement : renseignez-vous auprès de la direction.
          </p>
        </section>
        <section className="rounded-2xl bg-teal p-6 text-white shadow-float">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15"><Baby size={20} aria-hidden /></span>
          <h2 className="mt-4 font-display text-[18px] font-bold">Pas d'acte de naissance ? L'enfant est inscrit.</h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-white/85">
            L'absence d'acte n'empêche jamais l'inscription. La direction inscrit l'enfant, et une régularisation de son identité est engagée auprès de l'état civil.
            Sa scolarité commence tout de suite, et elle est suivie comme celle de tous les élèves.
          </p>
          <p className="mt-4 flex items-center gap-2 text-[13px] text-white/75"><ShieldCheck size={16} aria-hidden /> Aucun enfant exclu faute de papiers.</p>
        </section>
      </div>
    </PagePublique>
  );
}
