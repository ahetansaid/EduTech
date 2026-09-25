import type { Metadata } from "next";

export const metadata: Metadata = { title: "Connexion", description: "Accès sécurisé aux espaces BEILE." };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
