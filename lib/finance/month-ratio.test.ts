import { describe, expect, it } from "vitest";
import { monthRatio } from "./month-ratio";

describe("indicador de receitas × despesas", () => {
  it("calcula comprometimento, economia e proporção", () => {
    const ratio = monthRatio(100_000, 85_600);
    expect(ratio.comprometidoPct).toBe(85.6);
    expect(ratio.economia).toBe(14_400);
    expect(ratio.excedeu).toBe(false);
    expect(ratio.receitaShare + ratio.despesaShare).toBeCloseTo(1);
  });

  it("marca excesso quando a despesa supera a receita", () => {
    const ratio = monthRatio(50_000, 80_000);
    expect(ratio.excedeu).toBe(true);
    expect(ratio.comprometidoPct).toBe(160);
    expect(ratio.economia).toBe(-30_000);
  });

  it("trata mês vazio sem divisão por zero", () => {
    const ratio = monthRatio(0, 0);
    expect(ratio.vazio).toBe(true);
    expect(ratio.comprometidoPct).toBe(0);
    expect(ratio.receitaShare).toBe(0.5);
  });
});
