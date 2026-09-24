import { NextResponse, type NextRequest } from "next/server";

/**
 * Politique de sécurité du contenu stricte, avec un nonce unique par requête :
 * aucun script non émis par l'application ne peut s'exécuter (protection XSS),
 * la page ne peut pas être encadrée (clickjacking), aucune ressource tierce n'est chargée.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  // Seule origine externe autorisée : l'API BEILE configurée (aucun autre service tiers).
  const api = process.env.NEXT_PUBLIC_BEILE_API ? new URL(process.env.NEXT_PUBLIC_BEILE_API).origin : "";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Les attributs style (animations, positionnement des graphiques) nécessitent 'unsafe-inline' ;
    // les scripts, eux, restent strictement limités au nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${api ? ` ${api}` : ""}${dev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|images|icons).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
