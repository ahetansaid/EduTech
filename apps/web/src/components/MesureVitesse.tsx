"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Vitesse réellement vécue (Core Web Vitals) : chaque mesure part en arrière-plan vers notre propre API, sans
 * service tiers ni identifiant de personne. Le chemin est généralisé (numéros, identifiants remplacés par « : »)
 * pour qu'aucune mesure ne désigne un élève ; le type de réseau dit si la lenteur tient à la 3G.
 */
const NOMS = new Set(["LCP", "INP", "CLS", "FCP", "TTFB"]);

const generaliser = (chemin: string) =>
  chemin.replace(/\/(?:APP|CLS|ETB|DEM|CPT|AST|SEC)-[^/]+/gi, "/:id").replace(/\/[0-9a-f-]{8,}|\/\d+/gi, "/:id").slice(0, 120);

// Une mesure n'est envoyée qu'une fois. En développement, le mode strict de React enregistre l'écoute deux fois, et
// chaque écoute produit sa propre mesure (identifiants distincts, valeur identique) : on dédoublonne sur le contenu.
const envoyees = new Set<string>();

export function MesureVitesse() {
  useReportWebVitals((m) => {
    if (!NOMS.has(m.name) || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    const cle = `${m.name}|${window.location.pathname}|${Math.round(m.value * 1000)}`;
    if (envoyees.has(cle)) return;
    envoyees.add(cle);
    const reseau = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
    const corps = JSON.stringify({
      nom: m.name, valeur: Math.round(m.name === "CLS" ? m.value * 1000 : m.value), note: m.rating,
      page: generaliser(window.location.pathname), reseau: reseau && /^(slow-2g|2g|3g|4g)$/.test(reseau) ? reseau : null,
    });
    navigator.sendBeacon("/api/v1/public/mesures/vitesse", new Blob([corps], { type: "application/json" }));
  });
  return null;
}
