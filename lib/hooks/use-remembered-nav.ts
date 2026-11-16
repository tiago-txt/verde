"use client";

import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { rememberedHref } from "@/lib/navigation/screen-memory";

/**
 * Ao clicar num item de navegação, volta para a última tela estável daquela
 * seção (mês, ciclo e filtros) em vez de abrir no padrão.
 */
export function useRememberedNav(
  userId: string,
  onNavigate?: () => void,
) {
  const router = useRouter();

  return (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    onNavigate?.();

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const remembered = rememberedHref(userId, href);
    if (!remembered || remembered === href) return;

    event.preventDefault();
    router.push(remembered);
  };
}
