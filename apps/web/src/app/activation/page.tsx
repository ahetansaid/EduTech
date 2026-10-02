import type { Metadata } from "next";
import { ParcoursCode } from "@/components/securite/ParcoursCode";

export const metadata: Metadata = { title: "Activer mon compte" };

export default function PageActivation() {
  return <ParcoursCode objet="activation" />;
}
