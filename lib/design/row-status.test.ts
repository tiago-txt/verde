import { describe, expect, it } from "vitest";
import {
  budgetProjectionStatus,
  invoiceProjectionStatus,
} from "./row-status";

describe("status de linhas virtuais", () => {
  it("diferencia prevista, apurada, estouro e consumido", () => {
    expect(
      budgetProjectionStatus({
        isProvision: true,
        estouro: 0,
        restante: 100,
        status: "prevista",
      }),
    ).toBe("prevista");
    expect(
      budgetProjectionStatus({
        isProvision: true,
        estouro: 0,
        restante: 100,
        status: "apurada",
      }),
    ).toBe("apurada");
    expect(
      budgetProjectionStatus({
        isProvision: true,
        estouro: 200,
        restante: 0,
        status: "apurada",
      }),
    ).toBe("estouro");
    expect(
      budgetProjectionStatus({
        isProvision: true,
        estouro: 0,
        restante: 0,
        status: "apurada",
      }),
    ).toBe("consumido");
  });

  it("sobra não é tratada como provisão", () => {
    expect(
      budgetProjectionStatus({
        isProvision: false,
        estouro: 0,
        restante: 100,
        status: null,
      }),
    ).toBe("sobra");
  });

  it("fatura prioriza paga e vencida", () => {
    expect(
      invoiceProjectionStatus({ vencida: true, status: "paga" }),
    ).toBe("paga");
    expect(
      invoiceProjectionStatus({ vencida: true, status: "aberta" }),
    ).toBe("vencida");
    expect(
      invoiceProjectionStatus({ vencida: false, status: "parcial" }),
    ).toBe("parcial");
  });
});
