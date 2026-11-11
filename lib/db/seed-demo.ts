import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import {
  accounts,
  categories,
  creditCards,
  recurrences,
  tags,
  transactionTags,
  transactions,
  type CategoryType,
  type NewTransaction,
  type RecurrenceTemplate,
} from "./schema";
import * as schema from "./schema";
import { addMonths, dateInMonth, todayISO } from "@/lib/dates";
import { faturaDaCompra } from "@/lib/finance/cards";
import { buildInstallmentPlan } from "@/lib/finance/installments";

type DatabaseInstance = BetterSQLite3Database<typeof schema>;
type Tx = Parameters<Parameters<DatabaseInstance["transaction"]>[0]>[0];

const DEMO_MARKER = "Conta Corrente (Demo)";

function categoryId(
  tx: Tx,
  nome: string,
  tipo: CategoryType,
): string | null {
  const row = tx
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.nome, nome),
        eq(categories.tipo, tipo),
        isNull(categories.deletedAt),
      ),
    )
    .get();

  return row?.id ?? null;
}

function tagId(tx: Tx, nome: string): string {
  const existing = tx
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.nome, nome))
    .get();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  tx.insert(tags).values({ id, nome }).run();
  return id;
}

function insertDemoTransaction(
  tx: Tx,
  values: NewTransaction,
  tagIds: string[] = [],
) {
  const id = values.id ?? crypto.randomUUID();
  tx.insert(transactions).values({ ...values, id }).run();

  if (tagIds.length > 0) {
    tx.insert(transactionTags)
      .values(tagIds.map((tag) => ({ transactionId: id, tagId: tag })))
      .onConflictDoNothing()
      .run();
  }
}

/**
 * Popula o app com 3 meses de dados para visualização.
 * Idempotente: se a conta marcadora já existir, não faz nada.
 */
export function seedDemoData(db: DatabaseInstance): void {
  const marker = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.nome, DEMO_MARKER))
    .get();

  if (marker) return;

  const today = todayISO();
  const current = today.slice(0, 7);
  const months = [addMonths(current, -2), addMonths(current, -1), current];

  db.transaction((tx) => {
    const checkingId = crypto.randomUUID();
    const savingsId = crypto.randomUUID();
    const walletId = crypto.randomUUID();

    tx.insert(accounts)
      .values([
        {
          id: checkingId,
          nome: DEMO_MARKER,
          tipo: "corrente",
          saldoInicial: 250_000,
          cor: "#34d399",
          icone: "Landmark",
        },
        {
          id: savingsId,
          nome: "Poupança (Demo)",
          tipo: "poupanca",
          saldoInicial: 1_200_000,
          cor: "#38bdf8",
          icone: "PiggyBank",
        },
        {
          id: walletId,
          nome: "Carteira (Demo)",
          tipo: "dinheiro",
          saldoInicial: 15_000,
          cor: "#facc15",
          icone: "Wallet",
        },
      ])
      .run();

    const nuCardId = crypto.randomUUID();
    const visaCardId = crypto.randomUUID();

    tx.insert(creditCards)
      .values([
        {
          id: nuCardId,
          nome: "Nu (Demo)",
          bandeira: "visa",
          limite: 500_000,
          diaFechamento: 10,
          diaVencimento: 17,
          contaPagamentoId: checkingId,
          cor: "#a855f7",
          icone: "CreditCard",
        },
        {
          id: visaCardId,
          nome: "Visa (Demo)",
          bandeira: "visa",
          limite: 300_000,
          diaFechamento: 20,
          diaVencimento: 5,
          contaPagamentoId: checkingId,
          cor: "#38bdf8",
          icone: "CreditCard",
        },
      ])
      .run();

    const fixedTag = tagId(tx, "Fixo");
    const variableTag = tagId(tx, "Variável");
    const familyTag = tagId(tx, "Família");

    const salaryCategory = categoryId(tx, "Salário", "receita");
    const freelanceCategory = categoryId(tx, "Freelance", "receita");
    const rentCategory = categoryId(tx, "Aluguel", "despesa");
    const marketCategory = categoryId(tx, "Mercado", "despesa");
    const pharmacyCategory = categoryId(tx, "Farmácia", "despesa");
    const leisureCategory = categoryId(tx, "Lazer", "despesa");
    const otherExpenseCategory = categoryId(tx, "Outros", "despesa");

    const salaryRecurrenceId = crypto.randomUUID();
    if (salaryCategory) {
      const template: RecurrenceTemplate = {
        tipo: "receita",
        descricao: "Salário (Demo)",
        valor: 650_000,
        contaId: checkingId,
        cartaoId: null,
        contaDestinoId: null,
        categoriaId: salaryCategory,
        observacao: "Receita fixa de demonstração",
        tagIds: [fixedTag],
        pago: false,
      };

      tx.insert(recurrences)
        .values({
          id: salaryRecurrenceId,
          frequencia: "mensal",
          dataInicio: dateInMonth(months[0] as string, 5),
          dataFim: null,
          ativo: true,
          template,
        })
        .run();

      for (const month of months) {
        insertDemoTransaction(
          tx,
          {
            tipo: "receita",
            descricao: "Salário (Demo)",
            valor: 650_000,
            data: dateInMonth(month, 5),
            pago: true,
            contaId: checkingId,
            categoriaId: salaryCategory,
            observacao: "Receita fixa de demonstração",
            recorrenciaId: salaryRecurrenceId,
          },
          [fixedTag],
        );
      }
    }

    const rentRecurrenceId = crypto.randomUUID();
    if (rentCategory) {
      const template: RecurrenceTemplate = {
        tipo: "despesa",
        descricao: "Aluguel (Demo)",
        valor: 180_000,
        contaId: checkingId,
        cartaoId: null,
        contaDestinoId: null,
        categoriaId: rentCategory,
        observacao: "Despesa fixa de demonstração",
        tagIds: [fixedTag],
        pago: false,
      };

      tx.insert(recurrences)
        .values({
          id: rentRecurrenceId,
          frequencia: "mensal",
          dataInicio: dateInMonth(months[0] as string, 10),
          dataFim: null,
          ativo: true,
          template,
        })
        .run();

      for (const month of months) {
        insertDemoTransaction(
          tx,
          {
            tipo: "despesa",
            descricao: "Aluguel (Demo)",
            valor: 180_000,
            data: dateInMonth(month, 10),
            pago: true,
            contaId: checkingId,
            categoriaId: rentCategory,
            observacao: "Despesa fixa de demonstração",
            recorrenciaId: rentRecurrenceId,
          },
          [fixedTag],
        );
      }
    }

    if (marketCategory) {
      months.forEach((month, index) => {
        insertDemoTransaction(
          tx,
          {
            tipo: "despesa",
            descricao: "Mercado do mês (Demo)",
            valor: 85_000 + index * 4_500,
            data: dateInMonth(month, 8),
            pago: true,
            contaId: checkingId,
            categoriaId: marketCategory,
            observacao: "Compra de demonstração",
          },
          [variableTag, familyTag],
        );
      });
    }

    if (freelanceCategory) {
      insertDemoTransaction(
        tx,
        {
          tipo: "receita",
          descricao: "Freelance (Demo)",
          valor: 120_000,
          data: dateInMonth(months[1] as string, 22),
          pago: true,
          contaId: checkingId,
          categoriaId: freelanceCategory,
          observacao: "Receita extra de demonstração",
        },
        [variableTag],
      );
    }

    if (pharmacyCategory) {
      insertDemoTransaction(
        tx,
        {
          tipo: "despesa",
          descricao: "Farmácia (Demo)",
          valor: 4_500,
          data: dateInMonth(current, 6),
          pago: true,
          contaId: walletId,
          categoriaId: pharmacyCategory,
        },
        [variableTag],
      );
    }

    if (leisureCategory) {
      insertDemoTransaction(
        tx,
        {
          tipo: "despesa",
          descricao: "Cinema (Demo)",
          valor: 7_000,
          data: dateInMonth(current, 20),
          pago: false,
          contaId: checkingId,
          categoriaId: leisureCategory,
          observacao: "Ainda não pago",
        },
        [familyTag],
      );

      insertDemoTransaction(
        tx,
        {
          tipo: "despesa",
          descricao: "Restaurante (Demo)",
          valor: 12_000,
          data: dateInMonth(months[1] as string, 18),
          pago: true,
          contaId: checkingId,
          categoriaId: leisureCategory,
        },
        [familyTag],
      );
    }

    const notebookCategory = leisureCategory ?? otherExpenseCategory;
    if (notebookCategory) {
      const plan = buildInstallmentPlan({
        valorCents: 1_500_000,
        parcelas: 6,
        dataInicio: dateInMonth(months[0] as string, 20),
        baseValor: "total",
      });
      const groupId = crypto.randomUUID();

      for (const item of plan) {
        insertDemoTransaction(
          tx,
          {
            tipo: "despesa",
            descricao: "Notebook (Demo)",
            valor: item.valor,
            data: item.data,
            pago: item.numero <= 2,
            contaId: checkingId,
            categoriaId: notebookCategory,
            observacao: "Compra parcelada de demonstração",
            parcelaGrupoId: groupId,
            parcelaAtual: item.numero,
            parcelaTotal: plan.length,
          },
          [variableTag],
        );
      }
    }

    if (marketCategory && leisureCategory && pharmacyCategory) {
      // Compras no cartão Nu (demonstração).
      insertDemoTransaction(tx, {
        tipo: "despesa",
        descricao: "Mercado no Nu (Demo)",
        valor: 30_000,
        data: dateInMonth(months[1] as string, 9),
        pago: false,
        cartaoId: nuCardId,
        categoriaId: marketCategory,
      });

      insertDemoTransaction(tx, {
        tipo: "despesa",
        descricao: "Lazer no Nu (Demo)",
        valor: 20_000,
        data: dateInMonth(months[2] as string, 15),
        pago: false,
        cartaoId: nuCardId,
        categoriaId: leisureCategory,
      });

      const phoneGroupId = crypto.randomUUID();
      for (let index = 0; index < 3; index += 1) {
        insertDemoTransaction(tx, {
          tipo: "despesa",
          descricao: "Fone parcelado (Demo)",
          valor: 10_000,
          data: `${addMonths(dateInMonth(months[1] as string, 12).slice(0, 7), index)}-12`,
          pago: false,
          cartaoId: nuCardId,
          categoriaId: leisureCategory,
          parcelaGrupoId: phoneGroupId,
          parcelaAtual: index + 1,
          parcelaTotal: 3,
        });
      }

      // Pagamento de uma fatura anterior do Nu.
      const paidInvoiceKey = faturaDaCompra(
        dateInMonth(months[1] as string, 9),
        { diaFechamento: 10, diaVencimento: 17 },
      );
      insertDemoTransaction(tx, {
        tipo: "transferencia",
        descricao: "Pagamento de fatura Nu (Demo)",
        valor: 30_000,
        data: dateInMonth(months[2] as string, 5),
        pago: true,
        contaId: checkingId,
        cartaoDestinoId: nuCardId,
        faturaChave: paidInvoiceKey,
        observacao: "Pagamento de fatura de demonstração",
      });

      // Compras no cartão Visa (demonstração), com vencimento antes do fechamento.
      insertDemoTransaction(tx, {
        tipo: "despesa",
        descricao: "Farmácia no Visa (Demo)",
        valor: 12_000,
        data: dateInMonth(months[0] as string, 25),
        pago: false,
        cartaoId: visaCardId,
        categoriaId: pharmacyCategory,
      });

      insertDemoTransaction(tx, {
        tipo: "despesa",
        descricao: "Farmácia no Visa 2 (Demo)",
        valor: 15_000,
        data: dateInMonth(months[2] as string, 10),
        pago: false,
        cartaoId: visaCardId,
        categoriaId: pharmacyCategory,
      });

      insertDemoTransaction(tx, {
        tipo: "despesa",
        descricao: "Cinema no Visa (Demo)",
        valor: 5_000,
        data: dateInMonth(months[2] as string, 25),
        pago: false,
        cartaoId: visaCardId,
        categoriaId: leisureCategory,
      });
    }

    for (const month of months) {
      insertDemoTransaction(
        tx,
        {
          tipo: "transferencia",
          descricao: "Transferência para poupança (Demo)",
          valor: 50_000,
          data: dateInMonth(month, 15),
          pago: true,
          contaId: checkingId,
          contaDestinoId: savingsId,
          observacao: "Reserva mensal de demonstração",
        },
        [familyTag],
      );
    }
  });

  console.log("[verde] Dados de demonstração criados");
}
