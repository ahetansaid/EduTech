"use client";

import { CalendarDays, GraduationCap, Info, Sun, TreePine } from "lucide-react";
import { PagePublique } from "@/components/public/CadrePublic";
import { Cascade, Element } from "@/components/motion";
import { cn } from "@/lib/cn";

/**
 * Calendrier de l'année scolaire. Les dates officielles sont fixées chaque année par arrêté des ministères
 * en charge de l'éducation : tant qu'elles ne sont pas publiées, seules les périodes sont indiquées,
 * explicitement marquées « à confirmer » (aucune date inventée sur un service public).
 */
const ANNEE = "2025-2026";
const PERIODES = [
  { mois: "Septembre – octobre", titre: "Rentrée scolaire", texte: "Reprise des cours dans les écoles, collèges et lycées.", icone: CalendarDays, ton: "bleu" },
  { mois: "Décembre – janvier", titre: "Congés de fin d'année", texte: "Environ deux semaines, autour des fêtes de fin d'année.", icone: TreePine, ton: "vert" },
  { mois: "Mars – avril", titre: "Congés de Pâques", texte: "Congés du deuxième trimestre.", icone: Sun, ton: "vert" },
  { mois: "Juin", titre: "Examens du CEP et du BEPC", texte: "Certificat d'études primaires et brevet d'études du premier cycle.", icone: GraduationCap, ton: "ambre" },
  { mois: "Juin – juillet", titre: "Examen du baccalauréat", texte: "Épreuves écrites puis orales ; résultats publiés par l'Office du Bac.", icone: GraduationCap, ton: "ambre" },
  { mois: "Juillet", titre: "Fin de l'année scolaire", texte: "Conseils de classe, bulletins annuels, décisions de passage.", icone: CalendarDays, ton: "bleu" },
] as const;
const TONS = { bleu: "bg-blue-soft text-accent-ink", vert: "bg-success-bg text-success", ambre: "bg-warning-bg text-warning" };

export default function PageCalendrier() {
  return (
    <PagePublique surtitre={`Année scolaire ${ANNEE}`} titre="Calendrier scolaire" intro="Les grandes étapes de l'année, de la rentrée aux examens nationaux.">
      <div className="mb-8 flex gap-3 rounded-2xl border border-warning/25 bg-warning-bg px-5 py-4 text-[14px] text-warning">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>Les <strong>dates exactes</strong> sont fixées par arrêté ministériel. Elles seront publiées ici dès leur parution ; les périodes ci-dessous sont indicatives.</p>
      </div>
      <Cascade className="relative space-y-3 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-line sm:before:left-[31px]">
        {PERIODES.map((p) => (
          <Element key={p.titre}>
            <div className="relative flex gap-4 rounded-2xl border border-line/70 bg-surface p-4 shadow-float sm:p-5">
              <span className={cn("relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12", TONS[p.ton])}><p.icone size={20} aria-hidden /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{p.mois}</p>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">date à confirmer</span>
                </div>
                <h2 className="mt-1 font-display text-[17px] font-bold text-ink">{p.titre}</h2>
                <p className="mt-0.5 text-[14px] text-ink-2">{p.texte}</p>
              </div>
            </div>
          </Element>
        ))}
      </Cascade>
    </PagePublique>
  );
}
