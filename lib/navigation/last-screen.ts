export const TRANSIENT_SCREEN_PARAMS = ["detalhe", "editar", "novo"] as const;

const RESTORE_EXCLUDED_PREFIXES = [
  "/login",
  "/cadastro",
  "/trocar-senha",
  "/offline",
];

export type StableScreen = {
  path: string;
  search: string;
};

/**
 * Remove parâmetros transitórios (detalhe, edição, novo) para restaurar apenas
 * uma tela estável, sem reabrir modais ou formulários.
 */
export function stableScreen(pathname: string, search: string): StableScreen {
  const params = new URLSearchParams(search);
  for (const key of TRANSIENT_SCREEN_PARAMS) params.delete(key);
  const query = params.toString();
  return {
    path: pathname,
    search: query ? `?${query}` : "",
  };
}

/** Telas de autenticação/offline não servem como última tela do app. */
export function canRestoreLastScreen(pathname: string): boolean {
  return !RESTORE_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Só aceita caminhos internos para o parâmetro `voltar`. */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  const target = value?.trim();
  if (!target) return null;
  if (!target.startsWith("/") || target.startsWith("//")) return null;
  if (target.includes("\\") || target.startsWith("/\\")) return null;
  return target;
}
