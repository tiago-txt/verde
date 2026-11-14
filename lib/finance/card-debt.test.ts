import { describe, expect, it } from "vitest";
import { computeAccountBalancesAsOf } from "./balance";
import { splitCardDebt, type CardDebtPurchase } from "./cards";

const compraNu: CardDebtPurchase = {
  id: "compra-523",
  data: "2026-11-12",
  tipo: "despesa",
  valor: 52_300,
  faturaChave: "2026-12",
};

const compraFutura: CardDebtPurchase = {
  id: "compra-800",
  data: "2026-12-15",
  tipo: "despesa",
  valor: 80_000,
  faturaChave: "2027-01",
};

describe("dívida do cartão na data de referência", () => {
  it("em 13/11 a dívida atual é 523 e a compra de 800 é futura", () => {
    const debt = splitCardDebt(
      [compraNu, compraFutura],
      new Map([["2026-12", 0]]),
      "2026-11-13",
    );
    expect(debt.current).toBe(52_300);
    expect(debt.future).toBe(80_000);
  });

  it("o pagamento da fatura de 523 quita a dívida", () => {
    const debt = splitCardDebt(
      [compraNu, compraFutura],
      new Map([["2026-12", 52_300]]),
      "2026-12-13",
    );
    expect(debt.current).toBe(0);
    expect(debt.future).toBe(80_000);
  });

  it("não soma compra futura da mesma fatura na dívida atual", () => {
    const compraFuturaMesmaFatura: CardDebtPurchase = {
      id: "compra-300",
      data: "2026-11-25",
      tipo: "despesa",
      valor: 30_000,
      faturaChave: "2026-12",
    };
    const debt = splitCardDebt(
      [compraNu, compraFuturaMesmaFatura],
      new Map(),
      "2026-11-13",
    );
    expect(debt.current).toBe(52_300);
    expect(debt.future).toBe(30_000);
  });

  it("pagamento parcial é aplicado por FIFO na compra mais antiga", () => {
    const compraAnterior: CardDebtPurchase = {
      id: "compra-100",
      data: "2026-11-05",
      tipo: "despesa",
      valor: 10_000,
      faturaChave: "2026-12",
    };
    const debt = splitCardDebt(
      [compraNu, compraAnterior],
      new Map([["2026-12", 10_000]]),
      "2026-11-13",
    );
    expect(debt.current).toBe(52_300);
  });
});

describe("saldo das contas na data de referência", () => {
  it("transação futura marcada como paga não entra no saldo de hoje", () => {
    const balances = computeAccountBalancesAsOf(
      [{ id: "conta", saldoInicial: 0 }],
      [
        {
          tipo: "despesa",
          valor: 10_000,
          data: "2026-11-13",
          pago: true,
          contaId: "conta",
          contaDestinoId: null,
          cartaoId: null,
        },
        {
          tipo: "receita",
          valor: 50_000,
          data: "2026-12-01",
          pago: true,
          contaId: "conta",
          contaDestinoId: null,
          cartaoId: null,
        },
      ],
      "2026-11-13",
    );
    expect(balances.get("conta")).toBe(-10_000);
  });

  it("transferência entre contas próprias é neutra no total", () => {
    const balances = computeAccountBalancesAsOf(
      [
        { id: "operacional", saldoInicial: 0 },
        { id: "investimento", saldoInicial: 0 },
      ],
      [
        {
          tipo: "transferencia",
          valor: 6_000,
          data: "2026-11-10",
          pago: true,
          contaId: "operacional",
          contaDestinoId: "investimento",
          cartaoId: null,
        },
      ],
      "2026-11-13",
    );
    const total =
      (balances.get("operacional") ?? 0) + (balances.get("investimento") ?? 0);
    expect(balances.get("operacional")).toBe(-6_000);
    expect(balances.get("investimento")).toBe(6_000);
    expect(total).toBe(0);
  });
});
