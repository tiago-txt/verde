export const BUDGET_PERIODICIDADE_OPTIONS = [
  { value: 1, label: "Mensal" },
  { value: 2, label: "Bimestral" },
  { value: 3, label: "Trimestral" },
  { value: 6, label: "Semestral" },
  { value: 12, label: "Anual" },
] as const;

const PERIODICIDADE_LABELS: Record<number, string> = {
  1: "Mensal",
  2: "Bimestral",
  3: "Trimestral",
  4: "Quadrimestral",
  6: "Semestral",
  12: "Anual",
};

/** Nome curto da periodicidade; valores fora da lista usam "N meses". */
export function periodicidadeLabel(periodicidadeMeses: number): string {
  const meses = Number.isFinite(periodicidadeMeses)
    ? Math.min(12, Math.max(1, Math.trunc(periodicidadeMeses)))
    : 1;
  return PERIODICIDADE_LABELS[meses] ?? `${meses} meses`;
}

/** Ex.: "Bimestral · a cada 2 meses". */
export function descricaoDoPeriodo(periodicidadeMeses: number): string {
  if (periodicidadeMeses <= 1) return "Mensal";
  return `A cada ${periodicidadeMeses} meses`;
}
