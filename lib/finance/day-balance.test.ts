import { describe, expect, it } from "vitest";
import {
  computeDayBalances,
  computeDayBalancesFromDeltas,
  type DayBalanceTransaction,
} from "./day-balance";

const accounts = [
  { saldoInicial: 100_000 },
  { saldoInicial: 20_000 },
];

const transactions: DayBalanceTransaction[] = [
  {
    tipo: "receita",
    valor: 50_000,
    data: "2026-11-01",
    cartaoId: null,
  },
  {
    tipo: "despesa",
    valor: 20_000,
    data: "2026-11-02",
    cartaoId: null,
  },
  {
    tipo: "transferencia",
    valor: 10_000,
    data: "2026-11-02",
    cartaoId: null,
  },
  {
    tipo: "despesa",
    valor: 5_000,
    data: "2026-11-03",
    cartaoId: "cartao-1",
  },
  {
    tipo: "despesa",
    valor: 1_000,
    data: "2026-11-04",
    cartaoId: null,
    deletedAt: new Date(),
  },
  {
    tipo: "receita",
    valor: 10_000,
    data: "2026-11-05",
    cartaoId: null,
  },
];

const days = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-05",
];

describe("saldo no dia", () => {
  it("acumula saldo inicial, receitas e despesas não pagas", () => {
    const balances = computeDayBalances(accounts, transactions, days);

    expect(balances.get("2026-11-01")).toBe(170_000);
    expect(balances.get("2026-11-02")).toBe(150_000);
    expect(balances.get("2026-11-03")).toBe(150_000);
    expect(balances.get("2026-11-05")).toBe(160_000);
  });

  it("transferências cancelam, cartão e excluídos ficam fora", () => {
    const balances = computeDayBalances(accounts, transactions, days);
    expect(balances.get("2026-11-02")).toBe(150_000);
    expect(balances.get("2026-11-03")).toBe(150_000);
  });

  it("aceita deltas pré-agregados", () => {
    const balances = computeDayBalancesFromDeltas(
      120_000,
      [
        { data: "2026-11-01", delta: 50_000 },
        { data: "2026-11-02", delta: -20_000 },
        { data: "2026-11-05", delta: 10_000 },
      ],
      days,
    );

    expect(balances.get("2026-11-01")).toBe(170_000);
    expect(balances.get("2026-11-02")).toBe(150_000);
    expect(balances.get("2026-11-03")).toBe(150_000);
    expect(balances.get("2026-11-05")).toBe(160_000);
  });
});
