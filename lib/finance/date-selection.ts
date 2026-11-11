import { todayISO } from "@/lib/dates";

/**
 * Estado do diálogo de data no mobile. A seleção fica em rascunho até o
 * usuário confirmar em OK; Cancelar devolve exatamente o valor original.
 */
export type DateSelection = {
  original: string;
  draft: string;
};

export function openDateSelection(
  value: string | null | undefined,
  today: string = todayISO(),
): DateSelection {
  const original = value ?? "";
  return { original, draft: original || today };
}

export function selectDate(
  selection: DateSelection,
  iso: string,
): DateSelection {
  return { ...selection, draft: iso };
}

/** Valor a aplicar quando o usuário toca em OK. */
export function confirmDateSelection(selection: DateSelection): string {
  return selection.draft;
}

/** Valor mantido quando o usuário toca em Cancelar. */
export function cancelDateSelection(selection: DateSelection): string {
  return selection.original;
}
