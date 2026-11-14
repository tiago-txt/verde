import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECONDARY_INFO,
  isSecondaryInfo,
  normalizeSecondaryInfo,
  secondaryLine,
} from "./row-secondary";

describe("texto da linha secundária", () => {
  it("usa conta e categoria por padrão", () => {
    expect(DEFAULT_SECONDARY_INFO).toBe("conta-categoria");
    expect(
      secondaryLine("conta-categoria", {
        categoria: "Mercado",
        conta: "Itaú",
      }),
    ).toBe("Itaú · Mercado");
  });

  it("respeita cada opção", () => {
    const input = { categoria: "Mercado", conta: "Itaú" };
    expect(secondaryLine("categoria", input)).toBe("Mercado");
    expect(secondaryLine("conta", input)).toBe("Itaú");
    expect(secondaryLine("nenhuma", input)).toBe("");
  });

  it("omite partes vazias sem deixar separador solto", () => {
    expect(secondaryLine("conta-categoria", { categoria: "Mercado" })).toBe(
      "Mercado",
    );
    expect(secondaryLine("conta-categoria", { conta: "Itaú" })).toBe("Itaú");
    expect(secondaryLine("conta-categoria", {})).toBe("");
  });

  it("transferência mostra origem e destino", () => {
    expect(
      secondaryLine("conta", {
        transferencia: true,
        origem: "Itaú",
        destino: "Nubank",
      }),
    ).toBe("Itaú → Nubank");
  });

  it("valida e migra os valores persistidos", () => {
    expect(isSecondaryInfo("categoria")).toBe(true);
    expect(isSecondaryInfo("conta")).toBe(true);
    expect(isSecondaryInfo("outro")).toBe(false);
    expect(isSecondaryInfo(null)).toBe(false);
    expect(normalizeSecondaryInfo("categoria-conta")).toBe("conta-categoria");
    expect(normalizeSecondaryInfo("conta")).toBe("conta");
    expect(normalizeSecondaryInfo("outro")).toBeNull();
  });
});
