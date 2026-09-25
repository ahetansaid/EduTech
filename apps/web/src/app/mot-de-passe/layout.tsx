import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mot de passe" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
