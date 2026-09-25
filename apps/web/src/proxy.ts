import { NextResponse, type NextRequest } from "next/server";

/**
 * Politique de sécurité du contenu stricte, avec un nonce unique par requête :
 * aucun script non émis par l'application ne peut s'exécuter (protection XSS),
 * la page ne peut pas être encadrée (clickjacking), aucune ressource tierce n'est chargée.
 */
/** Pages publiques : tout le reste exige une session (contrôle d'ergonomie ; l'API reste seule juge de l'accès). */
const PUBLIQUES = [/^\/$/, /^\/connexion/, /^\/verifier/, /^\/aide/, /^\/etablissements/, /^\/inscription-scolaire/, /^\/calendrier/, /^\/donnees/, /^\/confidentialite/];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!PUBLIQUES.some((r) => r.test(pathname)) && !request.cookies.has("beile_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = `?retour=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Les attributs style (animations, positionnement des graphiques) nécessitent 'unsafe-inline' ;
    // les scripts, eux, restent strictement limités au nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`, // l'API est servie sous la même origine (réécriture)
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
      // Ressources publiques exclues : icônes, manifeste et images doivent se charger sans session.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt|images|icons).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
