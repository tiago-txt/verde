import { describe, expect, it } from "vitest";
import { createCardSchema, payInvoiceSchema } from "./cards";

const valid = {
  nome: "Nu",
  bandeira: "visa" as const,
  limite: 500_000,
  diaFechamento: 10,
  diaVencimento: 17,
  contaPagamentoId: null,
  cor: "#a855f7",
  icone: "CreditCard",
};

function parse(patch: Record<string, unknown>) {
  return createCardSchema.safeParse({ ...valid, ...patch });
}

describe("createCardSchema", () => {
  it("aceita um cartão válido", () => {
    expect(parse({}).success).toBe(true);
  });

  it("rejeita limite menor ou igual a zero", () => {
    expect(parse({ limite: 0 }).success).toBe(false);
    expect(parse({ limite: -1 }).success).toBe(false);
  });

  it("rejeita dias fora de 1–31", () => {
    expect(parse({ diaFechamento: 0 }).success).toBe(false);
    expect(parse({ diaFechamento: 32 }).success).toBe(false);
    expect(parse({ diaVencimento: 0 }).success).toBe(false);
    expect(parse({ diaVencimento: 32 }).success).toBe(false);
  });

  it("rejeita bandeira desconhecida", () => {
    expect(parse({ bandeira: "diners" }).success).toBe(false);
  });
});

describe("payInvoiceSchema", () => {
  const payment = {
    cartaoId: "11111111-1111-4111-8111-111111111111",
    faturaChave: "2026-12",
    contaId: "22222222-2222-4222-8222-222222222222",
    valor: 15000,
    data: "2026-12-17",
  };

  it("aceita pagamento válido", () => {
    expect(payInvoiceSchema.safeParse(payment).success).toBe(true);
  });

  it("rejeita valor zero e fatura inválida", () => {
    expect(payInvoiceSchema.safeParse({ ...payment, valor: 0 }).success).toBe(false);
    expect(
      payInvoiceSchema.safeParse({ ...payment, faturaChave: "2026-13" }).success,
    ).toBe(false);
  });
});
