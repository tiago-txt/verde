import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import { accounts, transactions, type Account } from "@/lib/db/schema";
import { currentMonth } from "@/lib/dates";
import {
  computeAccountBalances,
  type BalanceTransaction,
} from "@/lib/finance/balance";
import { getBudgetAccountDeltasForMonth } from "./budgets";
import { getCardInvoiceAccountDeltas } from "./cards";

export type AccountWithBalance = Account & {
  saldoAtual: number;
  saldoPrevisto: number;
};

export function listAccountsWithBalances(
  workspaceId: string,
): AccountWithBalance[] {
  const { db, ws } = scopedDb(workspaceId);

  const accountRows = db
    .select()
    .from(accounts)
    .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
    .orderBy(asc(accounts.arquivada), asc(accounts.nome))
    .all();

  const transactionRows = db
    .select({
      tipo: transactions.tipo,
      valor: transactions.valor,
      pago: transactions.pago,
      contaId: transactions.contaId,
      contaDestinoId: transactions.contaDestinoId,
      cartaoId: transactions.cartaoId,
      cartaoDestinoId: transactions.cartaoDestinoId,
      faturaChave: transactions.faturaChave,
      deletedAt: transactions.deletedAt,
    })
    .from(transactions)
    .where(and(ws(transactions.workspaceId), isNull(transactions.deletedAt)))
    .all();

  const atual = computeAccountBalances(
    accountRows,
    transactionRows as BalanceTransaction[],
    "atual",
  );
  const previsto = computeAccountBalances(
    accountRows,
    transactionRows as BalanceTransaction[],
    "previsto",
  );

  // Provisões (−) e sobras (+) do mês corrente afetam apenas o previsto.
  const budgetDeltas = getBudgetAccountDeltasForMonth(
    workspaceId,
    currentMonth(),
  );
  for (const [accountId, delta] of budgetDeltas) {
    previsto.set(accountId, (previsto.get(accountId) ?? 0) + delta);
  }

  // Faturas de cartão em aberto serão pagas pela conta de pagamento.
  const cardDeltas = getCardInvoiceAccountDeltas(workspaceId);
  for (const [accountId, delta] of cardDeltas) {
    if (!previsto.has(accountId)) continue;
    previsto.set(accountId, (previsto.get(accountId) ?? 0) + delta);
  }

  return accountRows.map((account) => ({
    ...account,
    saldoAtual: atual.get(account.id) ?? account.saldoInicial,
    saldoPrevisto: previsto.get(account.id) ?? account.saldoInicial,
  }));
}

export function listAllAccounts(workspaceId: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: accounts.id,
      nome: accounts.nome,
      tipo: accounts.tipo,
      cor: accounts.cor,
      icone: accounts.icone,
      arquivada: accounts.arquivada,
    })
    .from(accounts)
    .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
    .orderBy(asc(accounts.arquivada), asc(accounts.nome))
    .all();
}

export function getAccountById(workspaceId: string, id: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.id, id),
        ws(accounts.workspaceId),
        isNull(accounts.deletedAt),
      ),
    )
    .get();
}

export function countTransactionsForAccount(
  workspaceId: string,
  id: string,
): number {
  const { db, ws } = scopedDb(workspaceId);
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        or(eq(transactions.contaId, id), eq(transactions.contaDestinoId, id)),
      ),
    )
    .get();

  return result?.count ?? 0;
}
