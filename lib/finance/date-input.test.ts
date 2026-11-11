import { describe, expect, it } from "vitest";
import { maskBRDate, parseBRDate } from "./date-input";

describe("máscara dd/MM/yyyy", () => {
  it("formata progressivamente", () => {
    expect(maskBRDate("0")).toBe("0");
    expect(maskBRDate("01")).toBe("01");
    expect(maskBRDate("011")).toBe("01/1");
    expect(maskBRDate("0111")).toBe("01/11");
    expect(maskBRDate("01112")).toBe("01/11/2");
    expect(maskBRDate("01112026")).toBe("01/11/2026");
    expect(maskBRDate("01/11/2026")).toBe("01/11/2026");
  });

  it("ignora caracteres não numéricos e limita a 8 dígitos", () => {
    expect(maskBRDate("01a11b2026")).toBe("01/11/2026");
    expect(maskBRDate("011120269999")).toBe("01/11/2026");
  });
});

describe("parse dd/MM/yyyy → ISO", () => {
  it("aceita data válida", () => {
    expect(parseBRDate("07/11/2026")).toBe("2026-11-07");
    expect(parseBRDate("7/11/2026")).toBeNull();
  });

  it("aceita 29/02 em ano bissexto e rejeita em ano comum", () => {
    expect(parseBRDate("29/02/2024")).toBe("2024-02-29");
    expect(parseBRDate("29/02/2025")).toBeNull();
  });

  it("rejeita 31 em meses curtos", () => {
    expect(parseBRDate("31/04/2026")).toBeNull();
    expect(parseBRDate("31/12/2026")).toBe("2026-12-31");
  });

  it("rejeita mês/dia inválidos e entradas incompletas", () => {
    expect(parseBRDate("00/01/2026")).toBeNull();
    expect(parseBRDate("01/13/2026")).toBeNull();
    expect(parseBRDate("01/11/26")).toBeNull();
    expect(parseBRDate("")).toBeNull();
  });
});
