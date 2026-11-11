import { describe, expect, it } from "vitest";
import { aplicarEventosAoResumo } from "./budgets";
import { aplicarFaturasAoResumo } from "./cards";
import { buildFooterSummary } from "./summary-display";
import type { MonthSummary } from "./summary";

const base: MonthSummary = {
  entradasPagas: 500_000,
  saidasPagas: 200_000,
  entradasPrevistas: 600_000,
  saidasPrevistas: 300_000,
  saldoRealizado: 300_000,
  saldoPrevisto: 300_000,
};

describe("rodapé de resumo", () => {
  it("calcula as seis métricas e mantém o total previsto igual ao saldo previsto", () => {
    const withBudget = aplicarEventosAoResumo(base, [
      { tipo: "provisao", data: "2026-11-10", valor: 20_000, ciclo: "2026-11" },
      { tipo: "sobra", data: "2026-12-10", valor: 5_000, ciclo: "2026-11" },
    ]);
    const withInvoices = aplicarFaturasAoResumo(withBudget, [
      { restante: 10_000 },
    ]);
    const footer = buildFooterSummary(withInvoices);

    expect(footer).toEqual({
      entradas: 500_000,
      saidas: 200_000,
      realizado: 300_000,
      entradasPrevistas: 600_000,
      saidasPrevistas: 325_000,
      totalPrevisto: 275_000,
      saldoAnterior: 0,
      saldo: 300_000,
      previsto: 275_000,
    });
    expect(footer.totalPrevisto).toBe(withInvoices.saldoPrevisto);
  });

  it("fechamento soma o saldo anterior ao realizado e ao previsto", () => {
    const footer = buildFooterSummary(base, 12_500);
    expect(footer.saldoAnterior).toBe(12_500);
    expect(footer.saldo).toBe(312_500);
    expect(footer.previsto).toBe(312_500);
    expect(footer.saldo).toBe(footer.saldoAnterior + footer.realizado);
    expect(footer.previsto).toBe(
      footer.saldoAnterior + footer.totalPrevisto,
    );
  });

  it("liberação abate das saídas e nunca soma em entradas", () => {
    const withBudget = aplicarEventosAoResumo(base, [
      { tipo: "sobra", data: "2026-12-10", valor: 7_000, ciclo: "2026-11" },
    ]);
    const footer = buildFooterSummary(withBudget);

    expect(footer.entradasPrevistas).toBe(600_000);
    expect(footer.saidasPrevistas).toBe(293_000);
    expect(footer.totalPrevisto).toBe(307_000);
    expect(footer.totalPrevisto).toBe(withBudget.saldoPrevisto);
  });

  it("sem eventos mantém os valores realizados e previstos", () => {
    const footer = buildFooterSummary(base);
    expect(footer.totalPrevisto).toBe(base.saldoPrevisto);
    expect(footer.entradasPrevistas).toBe(base.entradasPrevistas);
    expect(footer.saidasPrevistas).toBe(base.saidasPrevistas);
  });
});
