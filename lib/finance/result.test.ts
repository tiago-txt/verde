import { describe, expect, it } from "vitest";
import {
  buildMonthlyResultSeries,
  summarizeResult,
  type ResultTransaction,
} from "./result";

/**
 * Cenário canônico de novembro/2026 (hoje = 13/11/2026).
 * Conta operacional e conta de investimento começam zeradas.
 */
const novembro: ResultTransaction[] = [
  // 10/11
  { tipo: "receita", valor: 250_000, data: "2026-11-10", pago: true, cartaoId: null },
  { tipo: "despesa", valor: 160_000, data: "2026-11-10", pago: true, cartaoId: null },
  {
    tipo: "transferencia",
    valor: 6_000,
    data: "2026-11-10",
    pago: true,
    cartaoId: null,
  },
  // 11/11
  { tipo: "despesa", valor: 30_000, data: "2026-11-11", pago: true, cartaoId: null },
  { tipo: "receita", valor: 12_500, data: "2026-11-11", pago: true, cartaoId: null },
  // 12/11 — compra no cartão (não paga)
  { tipo: "despesa", valor: 52_300, data: "2026-11-12", pago: false, cartaoId: "nu" },
  { tipo: "despesa", valor: 2_500, data: "2026-11-12", pago: true, cartaoId: null },
  // 13/11
  { tipo: "despesa", valor: 70_000, data: "2026-11-13", pago: true, cartaoId: null },
];

const dezembro: ResultTransaction[] = [
  // 10/12
  { tipo: "receita", valor: 250_000, data: "2026-12-10", pago: true, cartaoId: null },
  { tipo: "despesa", valor: 160_000, data: "2026-12-10", pago: true, cartaoId: null },
  {
    tipo: "transferencia",
    valor: 6_000,
    data: "2026-12-10",
    pago: true,
    cartaoId: null,
  },
  // 12/12 — pagamento da fatura de 523
  {
    tipo: "transferencia",
    valor: 52_300,
    data: "2026-12-12",
    pago: true,
    cartaoId: null,
    cartaoDestinoId: "nu",
    faturaChave: "2026-12",
  },
  // 15/12 — compra futura de 800 (fatura de janeiro/2027)
  { tipo: "despesa", valor: 80_000, data: "2026-12-15", pago: false, cartaoId: "nu" },
];

describe("resultado do mês — caixa", () => {
  const result = summarizeResult(novembro, "caixa");

  it("novembro fecha em zero: 2.625 de receitas − 2.625 de despesas", () => {
    expect(result.receitas).toBe(262_500);
    expect(result.despesas).toBe(262_500);
    expect(result.saldo).toBe(0);
  });

  it("a compra de 523 não é despesa de caixa", () => {
    expect(result.comprasCartao).toBe(0);
    expect(result.pagamentosFatura).toBe(0);
    expect(result.despesas).toBe(262_500);
  });

  it("o pagamento da fatura de dezembro é saída de caixa", () => {
    const dez = summarizeResult(dezembro, "caixa");
    // 10/12: +2.500 −1.600; 12/12: −523 → 377
    expect(dez.receitas).toBe(250_000);
    expect(dez.despesas).toBe(160_000 + 52_300);
    expect(dez.saldo).toBe(37_700);
    expect(dez.pagamentosFatura).toBe(52_300);
    // A compra de 15/12 não entra no caixa.
    expect(dez.comprasCartao).toBe(0);
  });

  it("a composição fecha exatamente com o valor exibido", () => {
    const despesas = result.breakdown.despesa.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    const receitas = result.breakdown.receita.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    expect(despesas).toBe(result.despesas);
    expect(receitas).toBe(result.receitas);
  });
});

describe("resultado do mês — competência", () => {
  it("novembro = −523: 2.625 de receitas − 3.148 de despesas", () => {
    const result = summarizeResult(novembro, "competencia");
    expect(result.receitas).toBe(262_500);
    expect(result.despesas).toBe(314_800);
    expect(result.saldo).toBe(-52_300);
    expect(result.comprasCartao).toBe(52_300);
    expect(result.pagamentosFatura).toBe(0);
  });

  it("o pagamento de dezembro não é nova despesa", () => {
    const dez = summarizeResult(dezembro, "competencia");
    // 10/12: +2.500 −1.600; compra de 15/12: −800 → 100
    expect(dez.receitas).toBe(250_000);
    expect(dez.despesas).toBe(240_000);
    expect(dez.saldo).toBe(10_000);
    expect(dez.pagamentosFatura).toBe(52_300);
  });

  it("a composição fecha exatamente com o valor exibido", () => {
    const result = summarizeResult(novembro, "competencia");
    const despesas = result.breakdown.despesa.reduce(
      (sum, item) => sum + item.value,
      0,
    );
    expect(despesas).toBe(result.despesas);
  });

  it("nunca soma a mesma compra e o pagamento no mesmo resultado", () => {
    const caixa = summarizeResult(novembro, "caixa");
    const competencia = summarizeResult(novembro, "competencia");
    // Caixa: compra 0 e pagamento 0 (fatura ainda em aberto).
    expect(caixa.comprasCartao).toBe(0);
    expect(caixa.pagamentosFatura).toBe(0);
    // Competência: compra 523 e pagamento 0 (o pagamento só ocorre em dezembro).
    expect(competencia.comprasCartao).toBe(52_300);
    expect(competencia.pagamentosFatura).toBe(0);
  });
});

describe("série mensal de resultado", () => {
  it("usa a base escolhida mês a mês", () => {
    const rows = [...novembro, ...dezembro];
    const caixa = buildMonthlyResultSeries(
      rows,
      { from: "2026-11-01", to: "2026-12-31" },
      "caixa",
    );
    expect(caixa.map((point) => point.saldo)).toEqual([0, 37_700]);

    const competencia = buildMonthlyResultSeries(
      rows,
      { from: "2026-11-01", to: "2026-12-31" },
      "competencia",
    );
    expect(competencia.map((point) => point.saldo)).toEqual([-52_300, 10_000]);
  });
});

