import { describe, expect, it } from "vitest";
import { exportRangeSchema, importRequestSchema } from "./import";

const request = {
  csv: "Data;Descrição;Valor;Tipo\n15/11/2026;Mercado;10,00;despesa",
  mapping: {
    data: "Data",
    descricao: "Descrição",
    valor: "Valor",
    tipo: "Tipo",
  },
  options: { ignoreDuplicates: true, createMissing: false },
};

describe("import/export schemas", () => {
  it("aceita uma importação válida", () => {
    expect(importRequestSchema.safeParse(request).success).toBe(true);
  });

  it("rejeita arquivo vazio e acima do limite", () => {
    expect(importRequestSchema.safeParse({ ...request, csv: "" }).success).toBe(
      false,
    );
    expect(
      importRequestSchema.safeParse({
        ...request,
        csv: "a".repeat(5_500_001),
      }).success,
    ).toBe(false);
  });

  it("rejeita mapeamento sem coluna obrigatória", () => {
    expect(
      importRequestSchema.safeParse({
        ...request,
        mapping: { ...request.mapping, data: "" },
      }).success,
    ).toBe(false);
  });

  it("rejeita período invertido", () => {
    expect(
      exportRangeSchema.safeParse({ de: "2026-11-30", ate: "2026-11-01" })
        .success,
    ).toBe(false);
    expect(
      exportRangeSchema.safeParse({ de: "2026-11-01", ate: "2026-11-30" })
        .success,
    ).toBe(true);
  });
});
