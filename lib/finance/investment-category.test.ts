import { describe, expect, it } from "vitest";
import { categoryTileColor, isInvestmentCategory } from "./investment-category";

const DESPESA = "hsl(var(--clay))";
const RECEITA = "hsl(var(--primary))";

describe("isInvestmentCategory", () => {
  it("reconhece categorias de investimento e rendimento", () => {
    expect(isInvestmentCategory("Investimentos")).toBe(true);
    expect(isInvestmentCategory("investimento")).toBe(true);
    expect(isInvestmentCategory("Rendimentos")).toBe(true);
    expect(isInvestmentCategory("Dividendos")).toBe(true);
    expect(isInvestmentCategory("Aportes")).toBe(true);
    expect(isInvestmentCategory("Resgates")).toBe(true);
  });

  it("ignora acentos e caixa", () => {
    expect(isInvestmentCategory("INVESTIMENTOS")).toBe(true);
    expect(isInvestmentCategory("Rendimentos fixos")).toBe(true);
    expect(isInvestmentCategory("Aplicação")).toBe(false);
  });

  it("não trata contas/categorias comuns como investimento", () => {
    expect(isInvestmentCategory("Mercado")).toBe(false);
    expect(isInvestmentCategory("Poupança")).toBe(false);
    expect(isInvestmentCategory("Salário")).toBe(false);
    expect(isInvestmentCategory(null)).toBe(false);
    expect(isInvestmentCategory(undefined)).toBe(false);
  });
});

describe("categoryTileColor", () => {
  it("usa vermelho para despesa de investimento", () => {
    expect(
      categoryTileColor({
        nome: "Investimentos",
        tipo: "despesa",
        cor: "#10b981",
      }),
    ).toBe(DESPESA);
  });

  it("usa verde para receita de investimento", () => {
    expect(
      categoryTileColor({
        nome: "Rendimentos",
        tipo: "receita",
        cor: "#0ea5e9",
      }),
    ).toBe(RECEITA);
  });

  it("mantém a cor da categoria quando não é investimento", () => {
    expect(
      categoryTileColor({ nome: "Mercado", tipo: "despesa", cor: "#84cc16" }),
    ).toBe("#84cc16");
    expect(
      categoryTileColor({ nome: "Salário", tipo: "receita", cor: "#22c55e" }),
    ).toBe("#22c55e");
  });

  it("não altera transferências nem lançamentos sem categoria", () => {
    expect(
      categoryTileColor({
        nome: "Investimentos",
        tipo: "transferencia",
        cor: "#94a3b8",
      }),
    ).toBe("#94a3b8");
    expect(
      categoryTileColor({ nome: null, tipo: "despesa", cor: "#94a3b8" }),
    ).toBe("#94a3b8");
  });
});
