import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import { headers } from "next/headers";
import { ThemeScript } from "@/components/shell/ThemeScript";
import "./globals.css";

const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["500", "600", "700", "800"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "BEILE — Intelligence et parcours éducatifs", template: "%s · BEILE" },
  description: "Système national interopérable de parcours et d'intelligence éducatifs du Bénin — prototype de démonstration sur données fictives.",
  robots: { index: false, follow: false },
  applicationName: "BEILE",
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
    <html lang="fr" suppressHydrationWarning className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable} h-full`}>
      <head>
        <ThemeScript nonce={nonce} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
