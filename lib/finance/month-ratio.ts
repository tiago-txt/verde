export type MonthRatio = {
  comprometido: number;
  comprometidoPct: number;
  economia: number;
  receitaShare: number;
  despesaShare: number;
  excedeu: boolean;
  vazio: boolean;
};

/** Indicador do card "Receitas × despesas" em centavos. */
export function monthRatio(receitas: number, despesas: number): MonthRatio {
  const vazio = receitas <= 0 && despesas <= 0;
  const comprometido = receitas > 0 ? despesas / receitas : despesas > 0 ? 1 : 0;
  const economia = receitas - despesas;
  const total = receitas + despesas;
  const receitaShare = total > 0 ? receitas / total : 0.5;
  const despesaShare = total > 0 ? despesas / total : 0.5;

  return {
    comprometido,
    comprometidoPct: Math.round(comprometido * 1000) / 10,
    economia,
    receitaShare,
    despesaShare,
    excedeu: despesas > receitas,
    vazio,
  };
}
