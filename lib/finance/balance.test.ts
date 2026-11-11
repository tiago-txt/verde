import { describe, expect, it } from "vitest";
import {
  computeAccountBalance,
  computeAccountBalances,
  type BalanceTransaction,
} from "./balance";

const contaA = { id: "conta-a", saldoInicial: 100_000 };
const contaB = { id: "conta-b", saldoInicial: 0 };

function tx(
  partial: Partial<BalanceTransaction> &
    Pick<BalanceTransaction, "tipo" | "valor">,
): BalanceTransaction {
  return {
    pago: true,
    contaId: "conta-a",
    contaDestinoId: null,
    cartaoId: null,
    ...partial,
  };
}

describe("cálculo de saldos", () => {
  const transactions: BalanceTransaction[] = [
    tx({ tipo: "receita", valor: 50_000 }),
    tx({ tipo: "despesa", valor: 20_000 }),
    tx({ tipo: "despesa", valor: 10_000, pago: false }),
    tx({
      tipo: "transferencia",
      valor: 15_000,
      contaDestinoId: "conta-b",
    }),
    tx({
      tipo: "despesa",
      valor: 99_999,
      cartaoId: "cartao-1",
    }),
    tx({ tipo: "receita", valor: 77_777, deletedAt: new Date() }),
  ];

  it("calcula o saldo atual apenas com lançamentos pagos", () => {
    const balances = computeAccountBalances(
      [contaA, contaB],
      transactions,
      "atual",
    );

    expect(balances.get("conta-a")).toBe(115_000);
    expect(balances.get("conta-b")).toBe(15_000);
  });

  it("inclui não pagos no saldo previsto", () => {
    const balances = computeAccountBalances(
      [contaA, contaB],
      transactions,
      "previsto",
    );

    expect(balances.get("conta-a")).toBe(105_000);
    expect(balances.get("conta-b")).toBe(15_000);
  });

  it("ignora compras no cartão e lançamentos excluídos", () => {
    const balance = computeAccountBalance(contaA, transactions, "previsto");
    expect(balance).toBe(105_000);
  });

  it("aceita saldo inicial negativo", () => {
    const contaNegativa = { id: "conta-c", saldoInicial: -5_000 };
    const balance = computeAccountBalance(
      contaNegativa,
      [tx({ tipo: "receita", valor: 3_000, contaId: "conta-c" })],
      "atual",
    );
    expect(balance).toBe(-2_000);
  });

  it("transferência não paga entra apenas no previsto", () => {
    const transferencia = tx({
      tipo: "transferencia",
      valor: 1_000,
      pago: false,
      contaDestinoId: "conta-b",
    });

    expect(
      computeAccountBalance(contaA, [transferencia], "atual"),
    ).toBe(100_000);
    expect(
      computeAccountBalance(contaA, [transferencia], "previsto"),
    ).toBe(99_000);
    expect(
      computeAccountBalance(contaB, [transferencia], "previsto"),
    ).toBe(1_000);
  });

  it("pagamento de fatura só reduz a conta quando pago", () => {
    const pago = tx({
      tipo: "transferencia",
      valor: 20_000,
      pago: true,
      cartaoDestinoId: "card-1",
      faturaChave: "2026-12",
    });
    const naoPago = { ...pago, pago: false };

    expect(computeAccountBalance(contaA, [pago], "atual")).toBe(80_000);
    expect(computeAccountBalance(contaA, [pago], "previsto")).toBe(80_000);
    expect(computeAccountBalance(contaA, [naoPago], "atual")).toBe(100_000);
    expect(computeAccountBalance(contaA, [naoPago], "previsto")).toBe(100_000);
  });
});
