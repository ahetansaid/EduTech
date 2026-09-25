import type { Metadata } from "next";
import { EnveloppeAide } from "./_composants";

export const metadata: Metadata = {
  title: "Centre d'aide",
  description: "Guides d'utilisation de BEILE pour chaque profil : se connecter, tâches courantes pas à pas, questions fréquentes et sécurité.",
};

/** Centre d'aide : public, consultable connecté ou non. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <EnveloppeAide>{children}</EnveloppeAide>;
}
