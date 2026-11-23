import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import { descreverProvisao, detalharLimite } from "./budget-row-text";

describe("texto da linha de orçamento", () => {
  it("explica a sobra rolada do próprio orçamento", () => {
    const texto = descreverProvisao({
      sobraRolada: { valor: 20_000, ciclo: "2026-09" },
    });
    expect(texto).toContain(formatCurrency(20_000));
    expect(texto).toContain("set/26");
    expect(texto.toLowerCase()).toContain("rolada");
    expect(texto).not.toBe("Disponível para gastar");
  });

  it("sem sobra mantém o texto simples", () => {
    expect(descreverProvisao({})).toBe("Disponível para gastar");
    expect(
      descreverProvisao({ sobraRolada: null, sobraRecebida: null }),
    ).toBe("Disponível para gastar");
  });

  it("sobra de outro orçamento é citada sem confundir com a rolagem", () => {
    const texto = descreverProvisao({
      sobraRecebida: [{ valor: 30_000, nome: "Lazer", ciclo: "2026-09" }],
    });
    expect(texto).toContain(formatCurrency(30_000));
    expect(texto).toContain("outro orçamento");
  });

  it("detalha o limite apenas quando há sobra de outro orçamento", () => {
    expect(
      detalharLimite({
        sobraRecebida: [
          { valor: 30_000, nome: "Lazer", ciclo: "2026-09" },
          { valor: 5_000, nome: "Pets", ciclo: "2026-09" },
        ],
      }),
    ).toBe(
      `Limite do ciclo inclui ${formatCurrency(30_000)} de Lazer e ${formatCurrency(5_000)} de Pets`,
    );

    // A rolagem do próprio ciclo já aparece na descrição da provisão.
    expect(detalharLimite({})).toBeNull();
  });
});
