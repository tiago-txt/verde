import { describe, expect, it } from "vitest";
import { summarizeTransactions } from "./summary";

describe("resumo do mês", () => {
  it("separa realizado e previsto e ignora transferências", () => {
    const summary = summarizeTransactions([
      { tipo: "receita", valor: 500_000, pago: true },
      { tipo: "receita", valor: 100_000, pago: false },
      { tipo: "despesa", valor: 200_000, pago: true },
      { tipo: "despesa", valor: 50_000, pago: false },
      { tipo: "transferencia", valor: 999_999, pago: true },
    ]);

    expect(summary).toEqual({
      entradasPagas: 500_000,
      saidasPagas: 200_000,
      entradasPrevistas: 600_000,
      saidasPrevistas: 250_000,
      saldoRealizado: 300_000,
      saldoPrevisto: 350_000,
    });
  });

  it("reflete o subconjunto filtrado", () => {
    const all = [
      { tipo: "despesa" as const, valor: 10_000, pago: true, categoriaId: "a" },
      { tipo: "despesa" as const, valor: 20_000, pago: false, categoriaId: "b" },
      { tipo: "receita" as const, valor: 30_000, pago: true, categoriaId: "a" },
    ];
    const filtered = all.filter((item) => item.categoriaId === "a");

    expect(summarizeTransactions(filtered)).toEqual({
      entradasPagas: 30_000,
      saidasPagas: 10_000,
      entradasPrevistas: 30_000,
      saidasPrevistas: 10_000,
      saldoRealizado: 20_000,
      saldoPrevisto: 20_000,
    });
  });
});
