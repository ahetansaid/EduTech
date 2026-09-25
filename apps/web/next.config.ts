import type { NextConfig } from "next";

/**
 * Front et back sont deux déploiements distincts. Le navigateur n'appelle que le front (/api/v1/…),
 * que Next réécrit vers le back-end : cookies de session « first-party », aucune origine tierce dans la CSP.
 * BEILE_API_INTERNE : URL du back-end (http://localhost:4000 en local, URL du projet API sur Vercel).
 */
const API_INTERNE = (process.env.BEILE_API_INTERNE ?? "http://localhost:4000").replace(/\/$/, "");

/** En-têtes de sécurité appliqués à toutes les réponses (la CSP à nonce est posée par proxy.ts). */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self), payment=(), usb=(), interest-cohort=()" },
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
  transpilePackages: ["@beile/contracts", "@beile/simulation"],
  async rewrites() {
    return [{ source: "/api/v1/:chemin*", destination: `${API_INTERNE}/api/v1/:chemin*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
