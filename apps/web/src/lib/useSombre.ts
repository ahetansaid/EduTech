"use client";

import { useEffect, useState } from "react";

/** Suit la classe .dark de <html> (bascule de thème en direct). */
export function useSombre() {
  const [sombre, setSombre] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const maj = () => setSombre(el.classList.contains("dark"));
    maj();
    const obs = new MutationObserver(maj);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return sombre;
}

/** Thème par défaut de l'espace (sombre pour le pilotage), sauf préférence explicite de l'utilisateur. */
export function useThemeEspace(sombreParDefaut: boolean) {
  useEffect(() => {
    let pref = "auto";
    try { pref = localStorage.getItem("beile-theme") ?? "auto"; } catch { /* stockage indisponible */ }
    document.documentElement.classList.toggle("dark", pref === "dark" || (pref === "auto" && sombreParDefaut));
  }, [sombreParDefaut]);
}
