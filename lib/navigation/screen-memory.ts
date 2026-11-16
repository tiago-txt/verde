import { stableScreen, type StableScreen } from "./last-screen";

export type ScreenMemory = Record<string, { search: string; at: number }>;

const MAX_ENTRIES = 24;
const STORAGE_PREFIX = "verde:screen-memory:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseMemory(raw: string | null): ScreenMemory {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const memory: ScreenMemory = {};
    for (const [path, value] of Object.entries(parsed)) {
      if (!path.startsWith("/")) continue;
      const entry = value as { search?: unknown; at?: unknown };
      if (typeof entry.search !== "string") continue;
      if (entry.search !== "" && !entry.search.startsWith("?")) continue;
      memory[path] = {
        search: entry.search,
        at: typeof entry.at === "number" ? entry.at : 0,
      };
    }
    return memory;
  } catch {
    return {};
  }
}

/** Grava a tela estável de uma seção, mantendo no máximo 24 seções. */
export function withScreenMemory(
  memory: ScreenMemory,
  screen: StableScreen,
  at: number,
): ScreenMemory {
  const next: ScreenMemory = {
    ...memory,
    [screen.path]: { search: screen.search, at },
  };
  const paths = Object.keys(next);
  if (paths.length > MAX_ENTRIES) {
    paths.sort((a, b) => (next[a]?.at ?? 0) - (next[b]?.at ?? 0));
    for (const path of paths.slice(0, paths.length - MAX_ENTRIES)) {
      delete next[path];
    }
  }
  return next;
}

/** URL estável lembrada da seção, ou null quando ainda não há memória. */
export function rememberedScreenHref(
  memory: ScreenMemory,
  pathname: string,
): string | null {
  const entry = memory[pathname];
  if (!entry) return null;
  return `${pathname}${entry.search}`;
}

/**
 * Guarda a tela estável no `sessionStorage`: a memória vale enquanto a sessão
 * do navegador/PWA estiver ativa.
 */
export function rememberScreen(
  userId: string,
  pathname: string,
  search: string,
  at = Date.now(),
): void {
  const store = session();
  if (!store) return;
  try {
    const memory = parseMemory(store.getItem(storageKey(userId)));
    const next = withScreenMemory(
      memory,
      stableScreen(pathname, search),
      at,
    );
    store.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Sem sessionStorage, a memória simplesmente não existe.
  }
}

/** Lê a tela estável lembrada para a seção. */
export function rememberedHref(
  userId: string,
  pathname: string,
): string | null {
  const store = session();
  if (!store) return null;
  try {
    return rememberedScreenHref(
      parseMemory(store.getItem(storageKey(userId))),
      pathname,
    );
  } catch {
    return null;
  }
}
