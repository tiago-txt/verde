"use client";

import { useEffect } from "react";

/**
 * Ajusta o bottom sheet ao visualViewport quando o teclado virtual abre.
 * Define variáveis usadas pelo DialogContent sem depender de JS no componente
 * de UI. Em desktop as classes `sm:` continuam mandando.
 */
export function useSheetViewport(open: boolean): void {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const visualViewport = window.visualViewport;
    const root = document.documentElement;
    if (!visualViewport) return;
    const viewport = visualViewport;

    function update() {
      const hiddenBottom = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      root.style.setProperty("--verde-sheet-bottom", `${hiddenBottom}px`);
      root.style.setProperty(
        "--verde-sheet-max-h",
        `${Math.max(320, viewport.height - 16)}px`,
      );
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--verde-sheet-bottom");
      root.style.removeProperty("--verde-sheet-max-h");
    };
  }, [open]);
}
