"use client";

import { Eye, FileLock2, Fingerprint, Lock, ScrollText, UserCheck } from "lucide-react";
import Link from "next/link";
import { PagePublique } from "@/components/public/CadrePublic";
import { Cascade, Element } from "@/components/motion";

const ENGAGEMENTS = [
  { icone: Fingerprint, titre: "Des données utiles, pas davantage", texte: "Identité rattachée au NPI, scolarité (inscriptions, notes, absences, examens) et diplômes. Rien d'autre n'est demandé aux familles." },
  { icone: UserCheck, titre: "Chacun ne voit que ce que sa mission exige", texte: "L'accès est décidé selon le rôle, le périmètre, le lien avec l'élève et la finalité. Un enseignant voit ses classes, un parent ses enfants, le ministère des chiffres agrégés." },
  { icone: ScrollText, titre: "Chaque accès est tracé", texte: "Toute consultation d'un dossier individuel, et tout refus, est inscrit dans un journal que seul le délégué à la protection des données consulte." },
  { icone: Lock, titre: "Rien n'est effacé en cachette", texte: "Le registre scolaire ne peut être ni modifié ni supprimé : une erreur se corrige par une correction motivée et visible." },
  { icone: FileLock2, titre: "Données sensibles cloisonnées", texte: "Les informations de protection de l'enfance et de besoins particuliers sont isolées et fermées par défaut." },
  { icone: Eye, titre: "Pas de publicité, pas de revente", texte: "Les données servent uniquement la scolarité des élèves et le pilotage du système éducatif. Les statistiques publiées sont anonymes." },
];

export default function PageConfidentialite() {
  return (
    <PagePublique surtitre="Vos droits" titre="Protection des données personnelles" intro="Ce que la plateforme conserve, pourquoi, qui peut y accéder, et comment exercer vos droits.">
      <Cascade className="grid gap-3 sm:grid-cols-2">
        {ENGAGEMENTS.map((e) => (
          <Element key={e.titre}>
            <div className="rounded-2xl border border-line/70 bg-surface p-5 shadow-float">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-soft text-accent-ink"><e.icone size={19} aria-hidden /></span>
              <h2 className="mt-3 font-display text-[16px] font-bold text-ink">{e.titre}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{e.texte}</p>
            </div>
          </Element>
        ))}
      </Cascade>
      <section className="mt-8 rounded-2xl bg-navy p-6 text-white shadow-float sm:p-8">
        <h2 className="font-display text-[20px] font-bold">Vos droits</h2>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-white/85">
          Vous pouvez demander l'accès aux données qui vous concernent ou qui concernent votre enfant, leur rectification si elles sont inexactes,
          et savoir qui les a consultées. Adressez votre demande au délégué à la protection des données, depuis votre espace (menu à votre nom, puis « Assistance »)
          ou auprès de l'établissement. En cas de désaccord, vous pouvez saisir l'Autorité de protection des données personnelles (APDP).
        </p>
        <Link href="/aide" className="mt-5 inline-flex h-11 items-center rounded-full bg-white px-5 text-[14px] font-semibold text-navy transition hover:bg-white/90">Centre d'aide</Link>
      </section>
    </PagePublique>
  );
}
