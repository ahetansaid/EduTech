import type { Metadata } from "next";
import { ParcoursCode } from "@/components/securite/ParcoursCode";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function PageMotDePasseOublie() {
  return <ParcoursCode objet="recuperation" />;
}
