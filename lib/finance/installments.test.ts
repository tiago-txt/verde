import { describe, expect, it } from "vitest";
import {
  buildInstallmentPlan,
  installmentTotal,
  splitInstallments,
} from "./installments";

describe("parcelamento", () => {
  it("divide com resto na primeira parcela", () => {
    const parcels = splitInstallments(10_000, 3);
    expect(parcels).toEqual([3_334, 3_333, 3_333]);
    expect(parcels.reduce((sum, value) => sum + value, 0)).toBe(10_000);
  });

  it("divide valores pequenos mantendo a soma", () => {
    const parcels = splitInstallments(999, 10);
    expect(parcels).toEqual([108, 99, 99, 99, 99, 99, 99, 99, 99, 99]);
    expect(installmentTotal(
      parcels.map((valor, index) => ({
        numero: index + 1,
        valor,
        data: "2026-01-10",
      })),
    )).toBe(999);
  });

  it("rejeita total menor que a quantidade de parcelas", () => {
    expect(() => splitInstallments(5, 10)).toThrow();
  });

  it("rejeita quantidade fora de 2–60", () => {
    expect(() => splitInstallments(1_000, 1)).toThrow();
    expect(() => splitInstallments(1_000, 61)).toThrow();
    expect(() => splitInstallments(1_000, 2.5)).toThrow();
  });

  it("gera datas mensais com fim de mês e bissexto", () => {
    const plan = buildInstallmentPlan({
      valorCents: 10_000,
      parcelas: 3,
      dataInicio: "2026-01-31",
      baseValor: "total",
    });

    expect(plan.map((item) => item.data)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(installmentTotal(plan)).toBe(10_000);

    const leapPlan = buildInstallmentPlan({
      valorCents: 3_000,
      parcelas: 2,
      dataInicio: "2024-01-31",
      baseValor: "total",
    });
    expect(leapPlan.map((item) => item.data)).toEqual([
      "2024-01-31",
      "2024-02-29",
    ]);
  });

  it("aceita valor por parcela", () => {
    const plan = buildInstallmentPlan({
      valorCents: 5_000,
      parcelas: 3,
      dataInicio: "2026-11-10",
      baseValor: "parcela",
    });

    expect(plan.map((item) => item.valor)).toEqual([5_000, 5_000, 5_000]);
    expect(installmentTotal(plan)).toBe(15_000);
  });
});
