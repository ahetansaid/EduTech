"use client";

import { RefreshCw, ShieldX, UserPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AnimatePresence, EASE, EntreePage, motion } from "@/components/motion";
import { Button, Card, EtatVide, PageHeader, Segmente } from "@/components/ui/primitives";
import { useFileTickets } from "@/lib/api/administration";
import { useComptes } from "@/lib/api/gouvernance";
import { ErreurApi } from "@/lib/http";
import { Comptes } from "./Comptes";
import { NouvelUtilisateur } from "./NouvelUtilisateur";
import { FILTRES_DEFAUT, Support } from "./Support";

type Onglet = "comptes" | "nouveau" | "support";
const ONGLETS: Onglet[] = ["comptes", "nouveau", "support"];

const SOUS_TITRE: Record<Onglet, string> = {
  comptes: "Qui peut se connecter, depuis quand, avec quels droits. Chaque opération est inscrite au journal d'audit.",
  nouveau: "Créer un utilisateur : identité vérifiée au registre, habilitations cohérentes, mot de passe temporaire affiché une seule fois.",
  support: "Demandes d'assistance des utilisateurs : répondre, prendre en charge, résoudre.",
};

export default function AdministrationPage() {
  return <Suspense><Administration /></Suspense>;
}

function Administration() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const brut = params.get("onglet");
  const onglet: Onglet = ONGLETS.includes(brut as Onglet) ? (brut as Onglet) : "comptes";
  const changer = (o: Onglet) => router.replace(o === "comptes" ? pathname : `${pathname}?onglet=${o}`, { scroll: false });

  const comptes = useComptes();
  // Même clé que la file par défaut de l'onglet Support : une seule requête, partagée.
  const file = useFileTickets(FILTRES_DEFAUT);
  const aTraiter = file.data ? file.data.compteurs.ouvert + file.data.compteurs.en_cours : 0;

  if (comptes.isError && comptes.error instanceof ErreurApi && comptes.error.refus) {
    return (
      <EntreePage>
        <div className="space-y-5">
          <PageHeader surtitre="Administration" titre="Comptes et accès" />
          <Card><EtatVide icone={ShieldX} titre="Réservé à l'administrateur de la plateforme" texte="Le refus a été inscrit au journal d'audit." /></Card>
        </div>
      </EntreePage>
    );
  }

  return (
    <EntreePage>
      <div className="space-y-5">
        <PageHeader
          surtitre="Administration"
          titre="Comptes et accès"
          sousTitre={SOUS_TITRE[onglet]}
          actions={
            <>
              {onglet === "comptes" && <Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={comptes.isFetching && !comptes.isPending} onClick={() => comptes.refetch()}>Actualiser</Button>}
              {onglet === "support" && <Button variante="secondaire" taille="sm" icone={RefreshCw} chargement={file.isFetching && !file.isPending} onClick={() => file.refetch()}>Actualiser</Button>}
              {onglet !== "nouveau" && <Button taille="sm" icone={UserPlus} onClick={() => changer("nouveau")}>Nouvel utilisateur</Button>}
            </>
          }
        />

        <div className="max-w-full overflow-x-auto" data-guide="admin-onglets">
          <Segmente
            label="Sections de l'administration"
            valeur={onglet}
            onChange={changer}
            options={[
              { valeur: "comptes", libelle: comptes.data ? `Comptes · ${comptes.data.length}` : "Comptes" },
              { valeur: "nouveau", libelle: "Nouvel utilisateur" },
              { valeur: "support", libelle: aTraiter ? `Support · ${aTraiter}` : "Support" },
            ]}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={onglet} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.24, ease: EASE }} className="min-w-0">
            {onglet === "comptes" && <Comptes comptes={comptes} />}
            {onglet === "nouveau" && <NouvelUtilisateur versComptes={() => changer("comptes")} />}
            {onglet === "support" && <Support />}
          </motion.div>
        </AnimatePresence>
      </div>
    </EntreePage>
  );
}
