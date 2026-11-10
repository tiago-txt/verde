import { describe, expect, it } from "vitest";
import {
  selectFixedRecurrenceTransactions,
  selectInstallmentTransactions,
  type ScopedTransaction,
} from "./scopes";

const fixed: ScopedTransaction[] = [
  { id: "jan", data: "2026-01-10", parcelaAtual: null },
  { id: "fev", data: "2026-02-10", parcelaAtual: null },
  { id: "mar", data: "2026-03-10", parcelaAtual: null },
  { id: "abr", data: "2026-04-10", parcelaAtual: null },
];

const installments: ScopedTransaction[] = [1, 2, 3, 4].map((numero) => ({
  id: `p${numero}`,
  data: `2026-0${numero}-10`,
  parcelaAtual: numero,
}));

describe("escopos de recorrência fixa", () => {
  const anchor = { id: "fev", data: "2026-02-10" };

  it("só este", () => {
    expect(
      selectFixedRecurrenceTransactions(fixed, anchor, "single").map((t) => t.id),
    ).toEqual(["fev"]);
  });

  it("este e os próximos", () => {
    expect(
      selectFixedRecurrenceTransactions(fixed, anchor, "future").map((t) => t.id),
    ).toEqual(["fev", "mar", "abr"]);
  });

  it("todos", () => {
    expect(
      selectFixedRecurrenceTransactions(fixed, anchor, "all").map((t) => t.id),
    ).toEqual(["jan", "fev", "mar", "abr"]);
  });
});

describe("escopos de parcelamento", () => {
  const anchor = { id: "p2", parcelaAtual: 2 };

  it("só esta parcela", () => {
    expect(
      selectInstallmentTransactions(installments, anchor, "single").map((t) => t.id),
    ).toEqual(["p2"]);
  });

  it("esta e as próximas", () => {
    expect(
      selectInstallmentTransactions(installments, anchor, "future").map((t) => t.id),
    ).toEqual(["p2", "p3", "p4"]);
  });

  it("todas as parcelas", () => {
    expect(
      selectInstallmentTransactions(installments, anchor, "all").map((t) => t.id),
    ).toEqual(["p1", "p2", "p3", "p4"]);
  });
});
