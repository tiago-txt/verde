import { formatCurrency, formatMonthShort, formatMonthTitle } from "@/lib/format";

/** Mês comercial curto a partir de uma data ou chave: "Setembro 26". */
export function mesCurtoDe(isoOuChave: string): string {
  return formatMonthTitle(isoOuChave.slice(0, 7)).replace(/\s\d{2}(\d{2})$/, " $1");
}

/**
 * Descrição da linha de provisão de um orçamento.
 *
 * Quando a sobra do ciclo anterior foi rolada para este, o limite do ciclo já
 * inclui o valor. Sem dizer isso, a linha "Orçamento atual · Disponível para
 * gastar R$ 500,00" parece inventar dinheiro no mês seguinte.
 */
export function descreverProvisao(input: {
  sobraRolada?: { valor: number; ciclo: string } | null;
  sobraRecebida?: Array<{ valor: number; nome: string; ciclo: string }> | null;
}): string {
  const rolada = input.sobraRolada?.valor ?? 0;
  const recebida = (input.sobraRecebida ?? []).reduce(
    (sum, item) => sum + item.valor,
    0,
  );

  if (rolada > 0) {
    return `Inclui ${formatCurrency(rolada)} de sobra de ${formatMonthShort(
      input.sobraRolada?.ciclo ?? "",
    )}, rolada para este ciclo`;
  }
  if (recebida > 0) {
    return `Inclui ${formatCurrency(recebida)} de sobra de outro orçamento`;
  }
  return "Disponível para gastar";
}

/**
 * Complemento exibido abaixo do nome: os componentes extras do limite.
 * Usado quando o limite cresce por sobras de OUTROS orçamentos; a rolagem do
 * próprio ciclo já aparece na descrição da provisão.
 * Retorna null quando o limite é só o valor do ciclo.
 */
export function detalharLimite(input: {
  sobraRecebida?: Array<{ valor: number; nome: string; ciclo: string }> | null;
}): string | null {
  const partes = (input.sobraRecebida ?? []).map(
    (item) => `${formatCurrency(item.valor)} de ${item.nome}`,
  );
  if (partes.length === 0) return null;
  return `Limite do ciclo inclui ${partes.join(" e ")}`;
}
