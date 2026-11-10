import { describe, expect, it } from "vitest";
import { accountInputSchema } from "./accounts";
import { categoryInputSchema } from "./categories";
import { tagInputSchema } from "./tags";
import {
  createTransactionSchema,
  transactionUpdateSchema,
  type TransactionFormValues,
} from "./transactions";

const contaId = crypto.randomUUID();
const contaDestinoId = crypto.randomUUID();
const categoriaId = crypto.randomUUID();

function validTransaction(
  overrides: Partial<TransactionFormValues> = {},
): TransactionFormValues {
  return {
    tipo: "despesa",
    descricao: "Mercado do mês",
    valor: 10_000,
    data: "2026-11-10",
    pago: true,
    contaId,
    contaDestinoId: null,
    categoriaId,
    tagIds: [],
    observacao: null,
    repeticao: "nenhuma",
    frequencia: "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
    ...overrides,
  };
}

describe("validação de lançamentos", () => {
  it("aceita um lançamento de despesa válido", () => {
    expect(createTransactionSchema.safeParse(validTransaction()).success).toBe(
      true,
    );
  });

  it("rejeita valor zero ou negativo", () => {
    expect(
      createTransactionSchema.safeParse(validTransaction({ valor: 0 })).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse(validTransaction({ valor: -100 }))
        .success,
    ).toBe(false);
  });

  it("rejeita transferência para a mesma conta", () => {
    const result = createTransactionSchema.safeParse(
      validTransaction({
        tipo: "transferencia",
        categoriaId: null,
        contaDestinoId: contaId,
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toContain("contaDestinoId");
    }
  });

  it("rejeita transferência sem conta de destino", () => {
    const result = createTransactionSchema.safeParse(
      validTransaction({
        tipo: "transferencia",
        categoriaId: null,
        contaDestinoId: null,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("aceita transferência entre contas diferentes", () => {
    const result = createTransactionSchema.safeParse(
      validTransaction({
        tipo: "transferencia",
        categoriaId: null,
        contaDestinoId,
      }),
    );

    expect(result.success).toBe(true);
  });

  it("rejeita transferência parcelada", () => {
    const result = createTransactionSchema.safeParse(
      validTransaction({
        tipo: "transferencia",
        categoriaId: null,
        contaDestinoId,
        repeticao: "parcelada",
        parcelas: 3,
      }),
    );

    expect(result.success).toBe(false);
  });

  it("exige categoria em despesa/receita", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({ categoriaId: null }),
      ).success,
    ).toBe(false);
  });

  it("rejeita parcelas fora do intervalo 2–60", () => {
    for (const parcelas of [1, 61, 0, -2]) {
      expect(
        createTransactionSchema.safeParse(
          validTransaction({
            repeticao: "parcelada",
            parcelas,
            valor: 100_000,
          }),
        ).success,
      ).toBe(false);
    }
  });

  it("aceita parcelamento total com resto de centavos", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({
          repeticao: "parcelada",
          parcelas: 3,
          valor: 10_000,
          baseValor: "total",
        }),
      ).success,
    ).toBe(true);
  });

  it("rejeita total menor que 1 centavo por parcela", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({
          repeticao: "parcelada",
          parcelas: 3,
          valor: 2,
          baseValor: "total",
        }),
      ).success,
    ).toBe(false);
  });

  it("aceita valor por parcela menor que a quantidade de parcelas", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({
          repeticao: "parcelada",
          parcelas: 3,
          valor: 1,
          baseValor: "parcela",
        }),
      ).success,
    ).toBe(true);
  });

  it("rejeita data final anterior ao início em recorrência fixa", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({
          repeticao: "fixa",
          dataFim: "2026-11-09",
        }),
      ).success,
    ).toBe(false);
  });

  it("rejeita tags duplicadas", () => {
    const tagId = crypto.randomUUID();
    expect(
      createTransactionSchema.safeParse(
        validTransaction({ tagIds: [tagId, tagId] }),
      ).success,
    ).toBe(false);
  });

  it("rejeita data inválida", () => {
    expect(
      createTransactionSchema.safeParse(
        validTransaction({ data: "2026-02-30" }),
      ).success,
    ).toBe(false);
  });

  it("valida o schema de atualização com escopo", () => {
    const result = transactionUpdateSchema.safeParse({
      ...validTransaction(),
      id: crypto.randomUUID(),
      scope: "future",
    });
    expect(result.success).toBe(true);

    expect(
      transactionUpdateSchema.safeParse({
        ...validTransaction(),
        id: crypto.randomUUID(),
        scope: "invalid",
      }).success,
    ).toBe(false);
  });
});

describe("validação de contas", () => {
  it("aceita conta válida com saldo negativo", () => {
    expect(
      accountInputSchema.safeParse({
        nome: "Conta corrente",
        tipo: "corrente",
        saldoInicial: -5_000,
        cor: "#34d399",
        icone: "Wallet",
      }).success,
    ).toBe(true);
  });

  it("rejeita cor e ícone inválidos", () => {
    expect(
      accountInputSchema.safeParse({
        nome: "Conta",
        tipo: "corrente",
        saldoInicial: 0,
        cor: "verde",
        icone: "Wallet",
      }).success,
    ).toBe(false);

    expect(
      accountInputSchema.safeParse({
        nome: "Conta",
        tipo: "corrente",
        saldoInicial: 0,
        cor: "#34d399",
        icone: "Inexistente",
      }).success,
    ).toBe(false);
  });
});

describe("validação de categorias e tags", () => {
  it("aceita categoria com pai opcional", () => {
    expect(
      categoryInputSchema.safeParse({
        nome: "Mercado",
        tipo: "despesa",
        categoriaPaiId: null,
        cor: "#84cc16",
        icone: "ShoppingCart",
      }).success,
    ).toBe(true);
  });

  it("rejeita id de pai inválido", () => {
    expect(
      categoryInputSchema.safeParse({
        nome: "Mercado",
        tipo: "despesa",
        categoriaPaiId: "abc",
        cor: "#84cc16",
        icone: "ShoppingCart",
      }).success,
    ).toBe(false);
  });

  it("rejeita tag vazia", () => {
    expect(tagInputSchema.safeParse({ nome: "   " }).success).toBe(false);
  });
});
