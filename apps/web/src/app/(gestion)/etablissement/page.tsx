"use client";

import { ArrowRight, BookOpenCheck, CalendarX2, CheckCircle2, Fingerprint, GraduationCap, HandHelping, Percent, School, TrendingDown, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TuileIndicateur } from "@/components/ui/donnees";
import { Badge, Button, Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { entier, heure, nombre, pourcent } from "@/lib/format";
import { Cascade, Compteur, Element } from "@/components/motion";
import { absentsDuJour, elevesClasse, elevesEtablissement, moyenneGenerale, nomComplet } from "@/lib/scolarite";
import { ETAB_RONIERS } from "@beile/simulation/micro";
import { elevesEnBaisse } from "@beile/simulation/projections";
import { useMonde } from "@/lib/store";

export default function MonEtablissement() {
  const monde = useMonde();
  const [accompagnement, setAccompagnement] = useState(false);
  const etab = monde.etablissements.find((e) => e.id === ETAB_RONIERS)!;
  const eleves = useMemo(() => elevesEtablissement(monde, monde.evenements, ETAB_RONIERS), [monde]);
  const ids = useMemo(() => new Set(eleves.map((e) => e.apprenant.id)), [eleves]);
  const baisse = useMemo(() => elevesEnBaisse(monde.evenements, ids), [monde, ids]);
  const absentsJour = absentsDuJour(monde.evenements).filter((a) => ids.has(a.apprenantId));
  const classes = monde.classes.filter((c) => c.etablissementId === ETAB_RONIERS);
  const enseignants = monde.enseignants.filter((e) => e.etablissementId === ETAB_RONIERS);
  const sansFormation = enseignants.filter((e) => !monde.evenements.some((x) => x.type === "FORMATION_ENSEIGNANT" && x.enseignantId === e.id && x.formation.startsWith("Évaluation formative")));
  const regularisations = eleves.filter((e) => e.apprenant.statutIdentite === "regularisation_en_cours");
  const moyennes = eleves.map((e) => moyenneGenerale(monde.evenements, e.apprenant.id, 2)).filter((v): v is number => v != null);
  const moy = moyennes.reduce((s, v) => s + v, 0) / Math.max(1, moyennes.length);
  const surcharge = classes.map((c) => ({ c, n: elevesClasse(monde, monde.evenements, c).length })).filter((x) => x.n > x.c.capacite);

  const actions = [
    { icone: TrendingDown, ton: "avertissement" as const, titre: `${baisse.length} élèves présentent une baisse importante en mathématiques`, detail: "Trois évaluations consécutives en recul d'au moins 5 points", lien: "/etablissement/eleves?filtre=baisse", action: "Voir la liste" },
    { icone: Fingerprint, ton: "info" as const, titre: `${regularisations.length} identité${regularisations.length > 1 ? "s" : ""} en cours de régularisation`, detail: "Inscription maintenue ; démarche engagée avec l'agence d'identification", lien: "/etablissement/eleves?filtre=identite", action: "Suivre" },
    { icone: GraduationCap, ton: "avertissement" as const, titre: `${sansFormation.length} enseignants n'ont pas suivi la formation obligatoire`, detail: "« Évaluation formative en mathématiques » — échéance 30/04/2026", lien: "/etablissement", action: "Relancer" },
    ...(surcharge.length ? [{ icone: Users, ton: "critique" as const, titre: `${surcharge.length} classe(s) au-delà de la capacité définie`, detail: surcharge.map((x) => `${x.c.libelle} : ${x.n}/${x.c.capacite}`).join(" · "), lien: "/etablissement", action: "Examiner" }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        surtitre="Mon établissement · Parakou · circonscription de Parakou"
        titre={etab.nom}
        sousTitre="Tout ce que l'établissement saisit lui revient sous une forme qui lui fait gagner du temps : bulletins, listes, alertes, tableau de bord."
        actions={<><Link href="/etablissement/inscription"><Button icone={UserPlus}>Inscrire un apprenant</Button></Link></>}
      />

      <Cascade className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Element><TuileIndicateur libelle="Apprenants" icone={Users} accent="bleu" valeur={<Compteur valeur={eleves.length} format={entier} />} indice={`${classes.length} classes`} /></Element>
        <Element><TuileIndicateur libelle="Occupation" icone={Percent} accent={eleves.length > etab.capacite ? "critique" : "sarcelle"} valeur={<Compteur valeur={(eleves.length / etab.capacite) * 100} format={(v) => nombre(v, 0)} />} unite="%" indice={`capacité ${etab.capacite} places`} /></Element>
        <Element><TuileIndicateur libelle="Enseignants" icone={GraduationCap} accent="bleu" valeur={<Compteur valeur={enseignants.length} format={entier} />} indice={`${nombre(eleves.length / enseignants.length, 0)} élèves par enseignant`} /></Element>
        <Element><TuileIndicateur libelle="Moyenne générale T2" icone={BookOpenCheck} accent="ambre" valeur={<Compteur valeur={moy} format={(v) => nombre(v, 2)} />} unite="/20" /></Element>
        <Element><TuileIndicateur libelle="Absents aujourd'hui" icone={CalendarX2} accent={absentsJour.length ? "critique" : "neutre"} valeur={<Compteur valeur={absentsJour.length} format={entier} />} indice={pourcent((absentsJour.length / Math.max(1, eleves.length)) * 100)} /></Element>
      </Cascade>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader icon={HandHelping} title="Ce que le système vous propose de faire" subtitle="Un assistant de gestion, pas seulement une base de données" />
          <ul className="space-y-2.5">
            {actions.map((a) => (
              <li key={a.titre} className="flex items-start gap-3 rounded-lg border border-line/70 p-3.5">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", a.ton === "critique" ? "bg-critical-bg text-critical" : a.ton === "info" ? "bg-info-bg text-info" : "bg-warning-bg text-warning")}><a.icone size={17} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-ink">{a.titre}</p>
                  <p className="text-[12.5px] text-ink-muted">{a.detail}</p>
                </div>
                <Link href={a.lien} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-blue hover:underline">{a.action} <ArrowRight size={14} /></Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded-lg bg-surface-2/70 p-4">
            {accompagnement ? (
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-success"><CheckCircle2 size={17} /> Accompagnement proposé pour {baisse.length} élèves — en attente de validation par le conseil pédagogique. Aucune mesure n'est appliquée sans décision humaine.</p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-ink-2">Le système propose un soutien en mathématiques pour les {baisse.length} élèves en baisse. La décision revient à l'équipe pédagogique.</p>
                <Button variante="valider" taille="sm" onClick={() => setAccompagnement(true)}>Proposer au conseil pédagogique</Button>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={CalendarX2} title="Absences du jour" subtitle="Mises à jour à chaque appel, sans ressaisie" action={<Badge ton={absentsJour.length ? "critique" : "succes"}>{absentsJour.length}</Badge>} />
          {absentsJour.length === 0 ? (
            <p className="rounded-md bg-surface-2/70 px-4 py-6 text-center text-[13px] text-ink-muted">Aucune absence enregistrée ce matin. Les absences saisies par les enseignants apparaissent ici instantanément.</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {absentsJour.map((x) => {
                const a = monde.apprenants.find((y) => y.id === x.apprenantId);
                const c = monde.classes.find((y) => y.id === x.classeId);
                return (
                  <li key={x.id} className="flex animate-slide-up items-center gap-3 py-2.5 text-[13.5px]">
                    <span className="flex-1 text-ink">{a ? nomComplet(a) : x.apprenantId}</span>
                    <Badge>{c?.libelle}</Badge>
                    <span className="text-[12px] tabular text-ink-muted">{heure(x.enregistreLe)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card className="p-0">
        <div className="px-5 pt-5"><CardHeader icon={School} title="Classes" subtitle="Effectifs calculés à partir des inscriptions et transferts enregistrés" /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-surface-2 text-left text-[11.5px] uppercase tracking-wide text-ink-muted">
              <tr><th className="px-5 py-2.5 font-semibold">Classe</th><th className="px-3 py-2.5 font-semibold">Effectif</th><th className="px-3 py-2.5 font-semibold">Moyenne T2</th><th className="px-3 py-2.5 font-semibold">Absents ce jour</th><th className="px-3 py-2.5 font-semibold">Professeur principal</th></tr>
            </thead>
            <tbody>
              {classes.map((c) => {
                const el = elevesClasse(monde, monde.evenements, c);
                const m = el.map((e) => moyenneGenerale(monde.evenements, e.id, 2)).filter((v): v is number => v != null);
                const pp = monde.enseignants.find((e) => e.id === c.enseignantPrincipalId);
                return (
                  <tr key={c.id} className="border-t border-line/60">
                    <td className="px-5 py-3 font-semibold text-ink">{c.libelle}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2"><span className="w-14 tabular">{el.length}/{c.capacite}</span><span className="h-1.5 w-24 rounded-full bg-surface-2"><span className={cn("block h-1.5 rounded-full", el.length > c.capacite ? "bg-critical" : "bg-teal")} style={{ width: `${Math.min(100, (el.length / c.capacite) * 100)}%` }} /></span></div>
                    </td>
                    <td className="px-3 py-3 tabular">{nombre(m.reduce((s, v) => s + v, 0) / Math.max(1, m.length), 2)}</td>
                    <td className="px-3 py-3 tabular">{absentsDuJour(monde.evenements, c.id).length}</td>
                    <td className="px-3 py-3 text-ink-2">{pp ? `${pp.prenoms} ${pp.nom}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
