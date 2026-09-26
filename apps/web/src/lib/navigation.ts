import type { Role } from "@beile/contracts";
import {
  Activity, BookOpenCheck, Building2, CalendarCheck, ChartNoAxesCombined, ClipboardCheck, Database, FileSearch, GitMerge, GraduationCap,
  Inbox, KeyRound, Landmark, ListChecks, Map, MessageSquareText, Network, ScrollText, ShieldCheck, Sparkles, UserPlus, Users, type LucideIcon,
} from "lucide-react";

export interface EntreeNav {
  href: string;
  libelle: string;
  icone: LucideIcon;
  roles: Role[];
  groupe: string;
  processus?: string;
}

/** Navigation déterminée par les habilitations. Masquer une entrée est cosmétique : l'accès aux données reste décidé par le moteur ABAC. */
export const NAVIGATION: EntreeNav[] = [
  { href: "/aujourd-hui", libelle: "Poste de pilotage", icone: ListChecks, roles: ["chef_etablissement", "inspecteur", "direction_departementale", "administration_centrale"], groupe: "Aujourd'hui", processus: "P9" },
  { href: "/cockpit", libelle: "Cockpit national", icone: ChartNoAxesCombined, roles: ["administration_centrale"], groupe: "Pilotage", processus: "P3" },
  { href: "/cockpit/carte", libelle: "Où agir ?", icone: Map, roles: ["administration_centrale", "direction_departementale"], groupe: "Pilotage", processus: "P3" },
  { href: "/territoire", libelle: "Console territoriale", icone: Landmark, roles: ["direction_departementale", "inspecteur"], groupe: "Pilotage", processus: "P3" },
  { href: "/ask", libelle: "Ask Education", icone: Sparkles, roles: ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"], groupe: "Pilotage", processus: "P3" },
  { href: "/simulation", libelle: "Simulation « et si ? »", icone: GitMerge, roles: ["administration_centrale", "direction_departementale"], groupe: "Pilotage", processus: "P2" },
  { href: "/demandes", libelle: "Demandes à traiter", icone: Inbox, roles: ["inspecteur", "direction_departementale", "administration_centrale"], groupe: "Pilotage", processus: "P9" },

  { href: "/etablissement", libelle: "Mon établissement", icone: Building2, roles: ["chef_etablissement"], groupe: "Établissement", processus: "P5" },
  { href: "/etablissement/inscription", libelle: "Inscrire un apprenant", icone: UserPlus, roles: ["chef_etablissement"], groupe: "Établissement", processus: "P4 · P6" },
  { href: "/etablissement/eleves", libelle: "Apprenants", icone: Users, roles: ["chef_etablissement"], groupe: "Établissement", processus: "P7 · P9" },
  { href: "/etablissement/justificatifs", libelle: "Justificatifs d'absence", icone: ClipboardCheck, roles: ["chef_etablissement"], groupe: "Établissement", processus: "P7" },
  { href: "/etablissement/examens", libelle: "Examens et certification", icone: BookOpenCheck, roles: ["chef_etablissement"], groupe: "Établissement", processus: "P8" },

  { href: "/enseignant", libelle: "Mes classes", icone: CalendarCheck, roles: ["enseignant"], groupe: "Enseignement", processus: "P7" },
  { href: "/enseignant/carriere", libelle: "Passeport professionnel", icone: GraduationCap, roles: ["enseignant"], groupe: "Enseignement", processus: "P10" },

  { href: "/famille", libelle: "Espace famille", icone: Users, roles: ["parent"], groupe: "Famille", processus: "P7" },
  { href: "/apprenant", libelle: "Mon passeport éducatif", icone: GraduationCap, roles: ["apprenant"], groupe: "Apprenant", processus: "P9" },

  { href: "/plateforme/dictionnaire", libelle: "Dictionnaire national", icone: Database, roles: ["administration_centrale", "chercheur", "direction_departementale"], groupe: "Données", processus: "P1 · P13" },
  { href: "/plateforme/qualite", libelle: "Qualité des données", icone: Activity, roles: ["administration_centrale", "direction_departementale", "inspecteur"], groupe: "Données", processus: "P13" },
  { href: "/plateforme/interoperabilite", libelle: "Interopérabilité", icone: Network, roles: ["administration_centrale", "administrateur", "dpo"], groupe: "Données", processus: "P12" },

  { href: "/audit", libelle: "Journal d'audit", icone: ScrollText, roles: ["dpo"], groupe: "Conformité", processus: "P11 · P14" },
  { href: "/audit/traitements", libelle: "Registre des traitements", icone: ShieldCheck, roles: ["dpo"], groupe: "Conformité", processus: "P14" },
  { href: "/plateforme/etat", libelle: "État du service", icone: FileSearch, roles: ["administration_centrale", "dpo", "administrateur"], groupe: "Conformité", processus: "P15" },

  { href: "/administration", libelle: "Comptes et accès", icone: KeyRound, roles: ["administrateur"], groupe: "Administration" },
];

export const ENTREE_PUBLIQUE = { href: "/verifier", libelle: "Vérifier un diplôme", icone: MessageSquareText };

export function navigationPour(roles: Role[]) {
  return NAVIGATION.filter((e) => e.roles.some((r) => roles.includes(r)));
}
