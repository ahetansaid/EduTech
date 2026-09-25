"use client";

import { useEffect } from "react";

/** Titre de l'onglet : « Écran · BEILE ». Chaque écran est identifiable dans l'historique et les onglets. */
export function useTitre(titre: string | null | undefined) {
  useEffect(() => {
    if (titre) document.title = `${titre} · BEILE`;
  }, [titre]);
}
