import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatCurrency,
  formatDate,
  formatMonth,
  formatMonthTitle,
  parseCurrencyToCents,
} from "./format";

function normalize(value: string): string {
  return value.replace(/\u00a0/g, " ");
}

describe("parseCurrencyToCents", () => {
  it("aceita formato brasileiro com milhar e vírgula", () => {
    expect(parseCurrencyToCents("1.234,56")).toBe(123456);
    expect(parseCurrencyToCents("R$ 1.234,56")).toBe(123456);
    expect(parseCurrencyToCents("R$1.234,56")).toBe(123456);
  });

  it("aceita formato com ponto decimal", () => {
    expect(parseCurrencyToCents("1234.56")).toBe(123456);
    expect(parseCurrencyToCents("0.50")).toBe(50);
  });

  it("interpreta ponto como separador de milhar quando há 3 dígitos", () => {
    expect(parseCurrencyToCents("1.234")).toBe(123400);
  });

  it("aceita valores negativos e parênteses", () => {
    expect(parseCurrencyToCents("-10,00")).toBe(-1000);
    expect(parseCurrencyToCents("(10,00)")).toBe(-1000);
  });

  it("rejeita entradas inválidas", () => {
    expect(parseCurrencyToCents("")).toBeNull();
    expect(parseCurrencyToCents("abc")).toBeNull();
    expect(parseCurrencyToCents("1,234.56")).toBeNull();
    expect(parseCurrencyToCents("12,345")).toBeNull();
  });
});

describe("formatCurrency", () => {
  it("formata centavos em BRL", () => {
    expect(normalize(formatCurrency(123456))).toBe("R$ 1.234,56");
    expect(normalize(formatCurrency(0))).toBe("R$ 0,00");
    expect(normalize(formatCurrency(-500))).toBe("-R$ 5,00");
  });
});

describe("formatDate", () => {
  it("converte ISO para dd/MM/yyyy sem deslocar o dia", () => {
    expect(formatDate("2026-11-09")).toBe("09/11/2026");
    expect(formatDate("2026-01-01")).toBe("01/01/2026");
  });
});

describe("formatMonth", () => {
  it("formata meses em português", () => {
    expect(formatMonth("2026-11")).toBe("novembro de 2026");
    expect(formatMonthTitle("2026-11")).toBe("Novembro 2026");
    expect(formatMonth("inválido")).toBe("inválido");
  });
});

describe("centsToInput", () => {
  it("gera valor editável com vírgula", () => {
    expect(centsToInput(123456)).toBe("1234,56");
    expect(centsToInput(-50)).toBe("0,50");
  });
});
