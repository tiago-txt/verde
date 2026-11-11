import { describe, expect, it } from "vitest";
import { createBudgetSchema } from "./budgets";

const valid = {
  nome: "Cartão Nu",
  valorPadrao: 70000,
  diaFechamento: 10,
  antecedenciaCiclos: 0 as const,
  categoriaIds: ["00000000-0000-4000-8000-000000000001"],
  contaId: null,
  cor: "#34d399",
  icone: "Target",
  dataInicio: "2026-11",
  dataFim: null,
};

function parse(patch: Record<string, unknown>) {
  return createBudgetSchema.safeParse({ ...valid, ...patch });
}

describe("createBudgetSchema", () => {
  it("aceita um orçamento válido", () => {
    expect(parse({}).success).toBe(true);
  });

  it("rejeita valor menor ou igual a zero", () => {
    expect(parse({ valorPadrao: 0 }).success).toBe(false);
    expect(parse({ valorPadrao: -100 }).success).toBe(false);
  });

  it("rejeita dia de fechamento fora de 1–31", () => {
    expect(parse({ diaFechamento: 0 }).success).toBe(false);
    expect(parse({ diaFechamento: 32 }).success).toBe(false);
    expect(parse({ diaFechamento: 1.5 }).success).toBe(false);
  });

  it("rejeita antecedência fora de 0/1", () => {
    expect(parse({ antecedenciaCiclos: 2 }).success).toBe(false);
    expect(parse({ antecedenciaCiclos: -1 }).success).toBe(false);
  });

  it("exige pelo menos uma categoria", () => {
    expect(parse({ categoriaIds: [] }).success).toBe(false);
  });

  it("rejeita fim anterior ao início", () => {
    expect(
      parse({ dataInicio: "2026-11", dataFim: "2026-10" }).success,
    ).toBe(false);
  });
});
