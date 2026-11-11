import { describe, expect, it } from "vitest";
import {
  buildTransactionSearchParams,
  countActiveFilters,
  hasActiveFilters,
  parseTransactionFilters,
} from "./filters";

const conta1 = "11111111-1111-4111-8111-111111111111";
const conta2 = "22222222-2222-4222-8222-222222222222";
const cat1 = "33333333-3333-4333-8333-333333333333";
const tag1 = "44444444-4444-4444-8444-444444444444";
const detalhe = "55555555-5555-4555-8555-555555555555";

describe("parsing de filtros da URL", () => {
  it("usa defaults e ignora valores inválidos", () => {
    const filters = parseTransactionFilters(
      {
        mes: "2026-13",
        tipo: "invalido",
        status: "x",
        dias: "99",
        detalhe: "abc",
        contas: "abc,def",
        categorias: "tambem-invalido",
      },
      "2026-11",
    );

    expect(filters.mes).toBe("2026-11");
    expect(filters.tipo).toBeNull();
    expect(filters.status).toBe("todos");
    expect(filters.dias).toBe(10);
    expect(filters.detalhe).toBeNull();
    expect(filters.contas).toEqual([]);
    expect(filters.categorias).toEqual([]);
  });

  it("aceita vírgula, arrays, repeticoes e remove duplicados", () => {
    const filters = parseTransactionFilters(
      {
        mes: "2026-12",
        tipo: "despesa",
        status: "nao_pagos",
        q: "  mercado  ",
        dias: "20",
        contas: `${conta1},${conta2}`,
        categorias: [cat1, cat1],
        tags: tag1,
        detalhe,
      },
      "2026-11",
    );

    expect(filters).toMatchObject({
      mes: "2026-12",
      tipo: "despesa",
      status: "nao_pagos",
      q: "mercado",
      dias: 20,
      contas: [conta1, conta2],
      categorias: [cat1],
      tags: [tag1],
      detalhe,
    });
  });

  it("limita a busca a 100 caracteres", () => {
    const filters = parseTransactionFilters({ q: "a".repeat(150) });
    expect(filters.q).toHaveLength(100);
  });
});

describe("URL de filtros", () => {
  it("faz round-trip", () => {
    const original = parseTransactionFilters(
      {
        mes: "2026-12",
        tipo: "receita",
        status: "pagos",
        q: "salário",
        dias: "20",
        contas: conta1,
        categorias: cat1,
        tags: tag1,
        detalhe,
      },
      "2026-11",
    );

    const params = buildTransactionSearchParams(original);
    const reparsed = parseTransactionFilters(
      Object.fromEntries(params.entries()),
      "2026-11",
    );

    expect(reparsed).toEqual(original);
  });

  it("detecta e conta filtros ativos", () => {
    const empty = parseTransactionFilters({}, "2026-11");
    expect(hasActiveFilters(empty)).toBe(false);
    expect(countActiveFilters(empty)).toBe(0);

    const active = parseTransactionFilters(
      { tipo: "despesa", status: "pagos", contas: conta1, q: "x" },
      "2026-11",
    );
    expect(hasActiveFilters(active)).toBe(true);
    expect(countActiveFilters(active)).toBe(4);
  });
});
