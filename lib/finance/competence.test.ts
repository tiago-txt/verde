import { describe, expect, it } from "vitest";
import {
  cicloCompetencia,
  clampBudgetOffset,
  dataCompetencia,
  faturaDaTransacao,
} from "./competence";
import { resolverCiclo, type BudgetSeriesInput } from "./budgets";

const nu = {
  diaFechamento: 15,
  diaVencimento: 10,
  fechamentoCompra: "proxima_fatura" as const,
};

function despesa(data: string, cartaoId: string | null = null, offset = 0) {
  return {
    tipo: "despesa" as const,
    data,
    cartaoId,
    orcamentoDeslocamento: offset,
  };
}

describe("competência do orçamento", () => {
  it("compra de 12/11 no cartão vence em 10/12 e consome dezembro", () => {
    const transaction = despesa("2026-11-12", "card-1");
    expect(dataCompetencia(transaction, nu)).toBe("2026-12-10");
    expect(cicloCompetencia(transaction, 1, nu)).toBe("2026-12");
    expect(faturaDaTransacao(transaction, nu)).toEqual({
      chave: "2026-12",
      vencimento: "2026-12-10",
    });
  });

  it("compra no dia do fechamento entra na próxima fatura por padrão", () => {
    const transaction = despesa("2026-12-15", "card-1");
    expect(dataCompetencia(transaction, nu)).toBe("2027-02-10");
    expect(cicloCompetencia(transaction, 1, nu)).toBe("2027-02");
  });

  it("opção 'nesta fatura' muda o vencimento e o ciclo consumido", () => {
    const transaction = despesa("2026-12-15", "card-1");
    const atual = { ...nu, fechamentoCompra: "fatura_atual" as const };
    expect(dataCompetencia(transaction, atual)).toBe("2027-01-10");
    expect(cicloCompetencia(transaction, 1, atual)).toBe("2027-01");
  });

  it("despesa em conta usa a própria data", () => {
    const transaction = despesa("2026-11-20");
    expect(dataCompetencia(transaction)).toBe("2026-11-20");
    expect(cicloCompetencia(transaction, 10)).toBe("2026-11");
  });

  it("deslocamento manual move o ciclo em ±1 sem mudar a data", () => {
    const transaction = despesa("2026-11-20");
    expect(cicloCompetencia({ ...transaction, orcamentoDeslocamento: 1 }, 10)).toBe(
      "2026-12",
    );
    expect(cicloCompetencia({ ...transaction, orcamentoDeslocamento: -1 }, 10)).toBe(
      "2026-10",
    );
    expect(clampBudgetOffset(9)).toBe(2);
    expect(clampBudgetOffset(-9)).toBe(-2);
    expect(clampBudgetOffset(undefined)).toBe(0);
  });

  it("parcelas caem cada uma na fatura do seu mês", () => {
    expect(cicloCompetencia(despesa("2026-11-20", "card-1"), 1, nu)).toBe(
      "2027-01",
    );
    expect(cicloCompetencia(despesa("2026-12-20", "card-1"), 1, nu)).toBe(
      "2027-02",
    );
    expect(cicloCompetencia(despesa("2027-01-20", "card-1"), 1, nu)).toBe(
      "2027-03",
    );
  });

  it("ciclo excluído ou fora da vigência não resolve e não consome", () => {
    const series: BudgetSeriesInput = {
      id: "budget-1",
      nome: "Mercado",
      dataInicio: "2026-11",
      dataFim: null,
      arquivado: false,
      versions: [
        {
          vigenteApartir: "2026-11",
          nome: "Mercado",
          valorPadrao: 50_000,
          diaFechamento: 1,
          antecedenciaCiclos: 0,
          origens: "todas",
          contaId: null,
          cartaoId: null,
          cor: "#34d399",
          icone: "Target",
          categoriaIds: [],
        },
      ],
      exceptions: [{ ciclo: "2026-12", tipo: "excluido", dados: null }],
    };

    expect(resolverCiclo(series, "2026-11")).not.toBeNull();
    expect(resolverCiclo(series, "2026-12")).toBeNull();
    expect(resolverCiclo(series, "2026-10")).toBeNull();
  });

  it("estorno no cartão usa a fatura da data do estorno", () => {
    const estorno = {
      tipo: "receita" as const,
      data: "2026-11-20",
      cartaoId: "card-1",
      orcamentoDeslocamento: 0,
    };
    expect(cicloCompetencia(estorno, 1, nu)).toBe("2027-01");
  });
});
