import { config } from "dotenv";
import type { NextConfig } from "next";

// En local, la configuration serveur (base, secrets) est lue dans le .env racine du dépôt ;
// sur Vercel, elle est fournie par les variables d'environnement du projet.
config({ path: "../../.env", quiet: true });

/** En-têtes de sécurité appliqués à toutes les réponses (la CSP à nonce est posée par proxy.ts). */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Démonstrations sans pastille de développement.
  devIndicators: false,
  transpilePackages: ["@beile/contracts", "@beile/simulation", "@beile/db", "@beile/api"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
