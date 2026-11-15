// Congela o comportamento aprovado pelo dono; não editar para passar.
import { describe, expect, it } from "vitest";
import {
  chaveDaFatura,
  datasDaFatura,
  faturaDaCompra,
  faturaPassaFiltros,
  intervaloDaFatura,
  montarResumoFatura,
  resumirFatura,
  totalDaFatura,
} from "./cards";
import { computeAccountBalances } from "./balance";
import type { CardInvoiceFilters, CardInvoiceSummary } from "./cards";

const CARD_9_15 = { diaFechamento: 9, diaVencimento: 15 };
const CARD_20_10 = { diaFechamento: 20, diaVencimento: 10 };
const CARD_16_23 = { diaFechamento: 16, diaVencimento: 23 };

const EMPTY_FILTERS = {
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos" as const,
  q: null,
};

function passa(
  resumo: CardInvoiceSummary,
  filters: CardInvoiceFilters = EMPTY_FILTERS,
) {
  return faturaPassaFiltros(
    {
      ...resumo,
      cartaoId: "cartao-1",
      cartaoNome: "Cartão",
      contaPagamentoId: null,
    },
    filters,
  );
}

describe("fatura por data da compra", () => {
  it("fecha no dia 9 e vence no dia 15", () => {
    expect(faturaDaCompra("2026-01-08", CARD_9_15)).toBe("2026-01");
    expect(faturaDaCompra("2026-01-09", CARD_9_15)).toBe("2026-02");
    expect(
      faturaDaCompra("2026-01-09", CARD_9_15, "fatura_atual"),
    ).toBe("2026-01");
    expect(faturaDaCompra("2026-01-10", CARD_9_15)).toBe("2026-02");
  });

  it("respeita vencimento menor ou igual ao fechamento", () => {
    expect(faturaDaCompra("2026-01-19", CARD_20_10)).toBe("2026-02");
    expect(faturaDaCompra("2026-01-20", CARD_20_10)).toBe("2026-03");
  });

  it("lida com mês curto e virada de ano", () => {
    expect(
      faturaDaCompra("2026-02-28", { diaFechamento: 31, diaVencimento: 15 }),
    ).toBe("2026-04");
    expect(faturaDaCompra("2026-12-20", CARD_9_15)).toBe("2027-01");
  });

  it("usa o cartão de fechamento 16 como o de referência", () => {
    expect(faturaDaCompra("2026-11-15", CARD_16_23)).toBe("2026-11");
    expect(faturaDaCompra("2026-11-16", CARD_16_23)).toBe("2026-12");
    expect(faturaDaCompra("2026-11-17", CARD_16_23)).toBe("2026-12");
    expect(faturaDaCompra("2026-12-16", CARD_16_23)).toBe("2027-01");
  });
});

describe("intervalo e chave da fatura", () => {
  it("calcula início, fechamento e vencimento", () => {
    expect(datasDaFatura("2026-01", CARD_9_15)).toEqual({
      chave: "2026-01",
      inicio: "2025-12-09",
      fechamento: "2026-01-09",
      vencimento: "2026-01-15",
    });
    expect(intervaloDaFatura("2026-01", CARD_9_15)).toEqual({
      inicio: "2025-12-09",
      fim: "2026-01-08",
    });
  });

  it("fatura_chave_override sempre prevalece sobre o cálculo", () => {
    expect(
      chaveDaFatura(
        { data: "2026-01-10", faturaChaveOverride: "2026-05" },
        CARD_9_15,
      ),
    ).toBe("2026-05");
    expect(chaveDaFatura({ data: "2026-01-10" }, CARD_9_15)).toBe("2026-02");
  });
});

describe("total, restante, crédito e visibilidade da linha", () => {
  it("total líquido soma despesas e abate estornos", () => {
    expect(
      totalDaFatura([
        { tipo: "despesa", valor: 10_000, data: "2026-01-01" },
        { tipo: "receita", valor: 2_500, data: "2026-01-02" },
      ]),
    ).toBe(7_500);
  });

  it("resumo parcial e total mantém a linha visível", () => {
    const parcial = montarResumoFatura(
      "2026-01",
      CARD_9_15,
      10_000,
      4_000,
      "2025-12-20",
    );
    expect(parcial).toMatchObject({
      total: 10_000,
      pago: 4_000,
      restante: 6_000,
      credito: 0,
      status: "parcial",
      vencida: false,
    });
    expect(passa(parcial)).toBe(true);

    const paga = montarResumoFatura(
      "2026-01",
      CARD_9_15,
      10_000,
      10_000,
      "2026-01-20",
    );
    expect(paga).toMatchObject({
      restante: 0,
      credito: 0,
      status: "paga",
      vencida: false,
    });
    expect(passa(paga)).toBe(true);

    const comCredito = montarResumoFatura(
      "2026-01",
      CARD_9_15,
      10_000,
      12_000,
      "2026-01-20",
    );
    expect(comCredito).toMatchObject({
      restante: 0,
      credito: 2_000,
      status: "paga",
    });
    expect(passa(comCredito)).toBe(true);

    const vazia = montarResumoFatura(
      "2026-01",
      CARD_9_15,
      0,
      0,
      "2025-12-20",
    );
    expect(vazia.restante).toBe(0);
    expect(passa(vazia)).toBe(false);
  });

  it("resumirFatura considera somente pagamentos pagos e vinculados", () => {
    const resumo = resumirFatura({
      chave: "2026-01",
      card: CARD_9_15,
      movimentos: [{ tipo: "despesa", valor: 10_000, data: "2025-12-20" }],
      pagamentos: [
        { valor: 3_000, pago: true, faturaChave: "2026-01" },
        { valor: 2_000, pago: false, faturaChave: "2026-01" },
        { valor: 1_000, pago: true, faturaChave: "2026-02" },
      ],
      hoje: "2025-12-20",
    });
    expect(resumo.pago).toBe(3_000);
    expect(resumo.restante).toBe(7_000);
    expect(resumo.status).toBe("parcial");
  });

  it("filtros de tipo/status tornam a fatura oculta, mas não a linha paga", () => {
    const paga = montarResumoFatura(
      "2026-01",
      CARD_9_15,
      10_000,
      10_000,
      "2026-01-20",
    );
    expect(
      passa(paga, { ...EMPTY_FILTERS, tipo: "receita" }),
    ).toBe(false);
    expect(
      passa(paga, { ...EMPTY_FILTERS, tipo: "transferencia" }),
    ).toBe(false);
    expect(passa(paga, { ...EMPTY_FILTERS, status: "pagos" })).toBe(false);
  });
});

describe("cartão não movimenta a conta", () => {
  it("compra no cartão não altera saldo atual nem previsto", () => {
    const account = { id: "conta-1", saldoInicial: 10_000 };
    const compra = {
      tipo: "despesa" as const,
      valor: 5_000,
      pago: false,
      contaId: null,
      contaDestinoId: null,
      cartaoId: "cartao-1",
      cartaoDestinoId: null,
    };
    expect(computeAccountBalances([account], [compra], "atual").get("conta-1")).toBe(
      10_000,
    );
    expect(
      computeAccountBalances([account], [compra], "previsto").get("conta-1"),
    ).toBe(10_000);
  });

  it("pagamento de fatura é transferência e reduz a conta", () => {
    const account = { id: "conta-1", saldoInicial: 10_000 };
    const pagamento = {
      tipo: "transferencia" as const,
      valor: 4_000,
      pago: true,
      contaId: "conta-1",
      contaDestinoId: null,
      cartaoId: null,
      cartaoDestinoId: "cartao-1",
      faturaChave: "2026-01",
    };
    expect(
      computeAccountBalances([account], [pagamento], "atual").get("conta-1"),
    ).toBe(6_000);
    expect(
      computeAccountBalances([account], [pagamento], "previsto").get("conta-1"),
    ).toBe(6_000);
  });

  it("pagamento de fatura ainda não pago não pesa no previsto", () => {
    const account = { id: "conta-1", saldoInicial: 10_000 };
    const pagamento = {
      tipo: "transferencia" as const,
      valor: 4_000,
      pago: false,
      contaId: "conta-1",
      contaDestinoId: null,
      cartaoId: null,
      cartaoDestinoId: "cartao-1",
      faturaChave: "2026-01",
    };
    expect(
      computeAccountBalances([account], [pagamento], "previsto").get("conta-1"),
    ).toBe(10_000);
  });
});
