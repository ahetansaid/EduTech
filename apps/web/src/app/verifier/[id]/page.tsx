"use client";

import type { ResultatVerification } from "@beile/contracts";
import { ArrowLeft, Ban, CircleAlert, CircleCheckBig, FileWarning, FlaskConical, Info, RefreshCw, ScanLine, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Cascade, EASE, Element, EntreePage, motion } from "@/components/motion";
import { Button, Card, Squelette } from "@/components/ui/primitives";
import { FORMAT_CERTIFICAT, NOM_EXAMEN, useVerification } from "@/lib/api/parcours";
import { cn } from "@/lib/cn";
import { date } from "@/lib/format";
import { ErreurApi } from "@/lib/http";
import { useThemeEspace } from "@/lib/useSombre";

type Statut = ResultatVerification["statut"];

/* Mapping central des quatre verdicts. */
const VERDICT: Record<Statut, { icone: LucideIcon; titre: string; couleur: string; fond: string; bord: string; conseil: string }> = {
  authentique: { icone: CircleCheckBig, titre: "Diplôme authentique", couleur: "text-success", fond: "bg-success-bg", bord: "border-success/40", conseil: "Les informations ci-dessous proviennent du registre national : comparez-les au document présenté." },
  altere: { icone: FileWarning, titre: "Document altéré", couleur: "text-critical", fond: "bg-critical-bg", bord: "border-critical/40", conseil: "Le diplôme existe, mais le document présenté a été modifié (nom, mention, note ou session). Ne l'acceptez pas ; demandez l'original ou le lien de vérification au titulaire." },
  revoque: { icone: Ban, titre: "Diplôme révoqué", couleur: "text-critical", fond: "bg-critical-bg", bord: "border-critical/40", conseil: "L'autorité de certification a retiré ce diplôme. Il ne doit pas être accepté." },
  introuvable: { icone: CircleAlert, titre: "Diplôme introuvable", couleur: "text-warning", fond: "bg-warning-bg", bord: "border-warning/40", conseil: "Aucun diplôme ne porte cet identifiant. Vérifiez la saisie ; si le document affirme le contraire, il est suspect." },
};

/** Simule un document retouché : un seul caractère de l'empreinte change, comme après une modification du contenu. */
const empreinteModifiee = (e: string) => e.slice(0, -1) + (e.at(-1) === "0" ? "1" : "0");

function Verification({ id }: { id: string }) {
  useThemeEspace(false);
  const params = useSearchParams();
  const presente = (params.get("e") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64);
  const [falsifie, setFalsifie] = useState(false);
  const empreinte = falsifie && presente ? empreinteModifiee(presente) : presente;
  const formatValide = FORMAT_CERTIFICAT.test(id);
  const q = useVerification(id, empreinte);

  const resultat: ResultatVerification | undefined = !formatValide ? { statut: "introuvable", explication: "Identifiant mal formé." } : q.data;

  return (
    <div className="space-y-5">
      <Link href="/verifier" className="inline-flex h-10 items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink"><ArrowLeft size={15} aria-hidden /> Nouvelle vérification</Link>

      {formatValide && q.isPending ? <EnCours id={id} /> : formatValide && q.isError ? (
        <Card className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-ink-muted"><RefreshCw size={24} aria-hidden /></span>
          <p className="mt-3 text-[17px] font-semibold text-ink">{q.error instanceof ErreurApi && q.error.statut === 429 ? "Trop de vérifications en peu de temps" : "Vérification impossible pour le moment"}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">{q.error instanceof ErreurApi && q.error.statut === 429 ? "Par mesure de protection, le service limite le nombre de vérifications par minute. Réessayez dans un instant." : `${q.error.message}. Aucun verdict n'est donné sans réponse du registre.`}</p>
          <Button className="mt-4" variante="secondaire" icone={RefreshCw} onClick={() => q.refetch()}>Réessayer</Button>
        </Card>
      ) : resultat && (
        <Verdict r={resultat} id={id} presente={!!presente} maj={formatValide ? q.dataUpdatedAt : 0} />
      )}

      {formatValide && presente && resultat && (resultat.statut === "authentique" || falsifie) && (
        <Card className="min-w-0">
          <div className="flex items-start gap-3">
            <FlaskConical size={20} className="mt-0.5 shrink-0 text-amber" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Tester la détection de fraude</p>
              <p className="mt-1 text-[13px] text-ink-2">Présentez au registre l&apos;empreinte d&apos;un document retouché (un seul caractère diffère) : la requête part réellement vers le service et le verdict change.</p>
              <div className="mt-3">
                {falsifie
                  ? <Button taille="sm" variante="secondaire" onClick={() => setFalsifie(false)}>Revenir au document original</Button>
                  : <Button taille="sm" variante="danger" onClick={() => setFalsifie(true)}>Présenter un document retouché</Button>}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Verdict({ r, id, presente, maj }: { r: ResultatVerification; id: string; presente: boolean; maj: number }) {
  const v = VERDICT[r.statut];
  const negatif = r.statut === "altere" || r.statut === "revoque";
  return (
    <motion.div key={`${r.statut}-${maj}`} initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={negatif ? { opacity: 1, y: 0, scale: 1, x: [0, -8, 8, -5, 5, 0] } : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: EASE, x: { delay: 0.35, duration: 0.45 } }}>
      <Card className={cn("border-2 text-center", v.bord)}>
        <div className="relative mx-auto h-20 w-20">
          {r.statut === "authentique" && <motion.span className="absolute inset-0 rounded-full bg-success/25" initial={{ scale: 0.8, opacity: 0.8 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 1.2, delay: 0.25, ease: "easeOut" }} aria-hidden />}
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 380, damping: 16, delay: 0.1 }} className={cn("relative flex h-20 w-20 items-center justify-center rounded-full", v.fond, v.couleur)}>
            <v.icone size={40} aria-hidden />
          </motion.span>
        </div>
        <h1 className={cn("mt-4 text-[26px] font-bold leading-tight sm:text-[28px]", v.couleur)} aria-live="polite">{v.titre}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-2">{r.statut === "authentique" ? v.conseil : r.explication}</p>

        {r.statut === "authentique" ? (
          <Cascade className="mx-auto mt-6 max-w-md space-y-0 text-left">
            {([
              ["Titulaire", r.titulaire],
              ["Diplôme", `${NOM_EXAMEN[r.examen] ?? r.examen} (${r.examen})`],
              ["Session", r.session],
              ["Mention", r.mention],
              ["Délivré le", date(r.delivreLe)],
              ["Identifiant", r.certificatId],
            ] as const).map(([l, val]) => (
              <Element key={l} className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 text-sm">
                <span className="shrink-0 text-ink-muted">{l}</span>
                <span className={cn("min-w-0 break-words text-right font-semibold text-ink", l === "Identifiant" && "font-mono text-[12.5px]")}>{val}</span>
              </Element>
            ))}
          </Cascade>
        ) : (
          <p className={cn("mx-auto mt-4 max-w-md rounded-lg px-4 py-3 text-left text-[13px]", v.fond, v.couleur)}>{v.conseil}</p>
        )}

        {r.statut === "authentique" && !presente && (
          <p className="mx-auto mt-4 flex max-w-md items-start gap-2 rounded-lg bg-info-bg px-3.5 py-2.5 text-left text-[12.5px] text-info">
            <Info size={15} className="mt-0.5 shrink-0" aria-hidden />
            Vérification par identifiant seul : le diplôme existe, mais l&apos;intégrité du document papier n&apos;a pas été contrôlée. Scannez son QR code pour la contrôler.
          </p>
        )}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-ink-muted">
          <ShieldCheck size={13} aria-hidden />
          {maj ? `Réponse du registre national des certifications · ${new Date(maj).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}` : `Identifiant « ${id.slice(0, 40)} » non conforme : aucune requête envoyée`}
        </p>
      </Card>
    </motion.div>
  );
}

function EnCours({ id }: { id: string }) {
  return (
    <Card className="text-center" aria-busy>
      <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
        <motion.span className="absolute inset-0 rounded-full border-2 border-blue/30" animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }} transition={{ duration: 1.6, repeat: Infinity }} aria-hidden />
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-soft text-accent-ink"><ScanLine size={34} aria-hidden /></span>
      </div>
      <p className="mt-4 text-[17px] font-semibold text-ink">Interrogation du registre national…</p>
      <p className="mt-1 font-mono text-xs text-ink-muted">{id}</p>
      <div className="mx-auto mt-6 max-w-md space-y-2.5">{[0, 1, 2].map((i) => <Squelette key={i} className="h-6" />)}</div>
    </Card>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EntreePage>
      <Suspense fallback={<EnCours id={decodeURIComponent(id)} />}><Verification id={decodeURIComponent(id).toUpperCase()} /></Suspense>
    </EntreePage>
  );
}
