import type { MetadataRoute } from "next";

/** Manifeste d'application : BEILE s'installe sur l'écran d'accueil du téléphone (enseignants, familles). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BEILE — Plateforme nationale de l'éducation",
    short_name: "BEILE",
    description: "Parcours éducatifs et pilotage du système éducatif du Bénin.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0A3764",
    theme_color: "#0A3764",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
