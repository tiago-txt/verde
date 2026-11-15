/** Cores de tipo, iguais às usadas nas pastilhas de despesa/receita. */
const DESPESA_COLOR = "hsl(var(--clay))";
const RECEITA_COLOR = "hsl(var(--primary))";

/**
 * Termos que identificam movimentações de investimento pelo nome da categoria.
 * Inclui aportes/resgates e rendimentos, independentemente do tipo.
 */
const INVESTMENT_TERMS = [
  "investimento",
  "investimentos",
  "rendimento",
  "rendimentos",
  "dividendo",
  "dividendos",
  "aporte",
  "aportes",
  "resgate",
  "resgates",
];

/** Normaliza nome de categoria: sem acentos, minúsculo e sem espaços nas pontas. */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isInvestmentCategory(nome?: string | null): boolean {
  if (!nome) return false;
  const normalized = normalize(nome);
  return INVESTMENT_TERMS.some((term) => normalized.includes(term));
}

/**
 * Cor do ícone da categoria na lista de lançamentos.
 *
 * Categorias de investimento seguem o tipo do lançamento: despesa (aporte)
 * em vermelho e receita (rendimento/resgate) em verde. As demais categorias
 * continuam com a própria cor.
 */
export function categoryTileColor({
  nome,
  tipo,
  cor,
}: {
  nome?: string | null;
  tipo: "despesa" | "receita" | "transferencia";
  cor?: string | null;
}): string | null | undefined {
  if (tipo === "transferencia" || !isInvestmentCategory(nome)) return cor;
  return tipo === "receita" ? RECEITA_COLOR : DESPESA_COLOR;
}
