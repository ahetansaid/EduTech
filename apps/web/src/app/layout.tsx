import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/montserrat";
import "@fontsource-variable/jetbrains-mono";
import { headers } from "next/headers";
import { ThemeScript } from "@/components/shell/ThemeScript";
import "./globals.css";
import { Providers } from "./providers";

/* Polices auto-hébergées (Fontsource) : aucun appel à un service tiers, build indépendant du réseau. */

export const metadata: Metadata = {
  title: { default: "BEILE — Plateforme nationale de l'éducation", template: "%s · BEILE" },
  description: "Système national interopérable de parcours et d'intelligence éducatifs du Bénin.",
  robots: { index: false, follow: false },
  applicationName: "BEILE",
  appleWebApp: { capable: true, title: "BEILE", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a3764" },
    { media: "(prefers-color-scheme: dark)", color: "#06121f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning className="h-full">
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="min-h-full"><Providers>{children}</Providers></body>
    </html>
  );
}
