import { and, desc, eq, isNull } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import { accounts, creditCards, transactions } from "@/lib/db/schema";
import { groupDuplicates, groupRepeated, type DuplicateGroup, type RepeatedGroup } from "@/lib/finance/duplicates";

export type DuplicateTransactionRow = {
  id: string;
  tipo: string;
  descricao: string;
  data: string;
  valor: number;
  contaId: string | null;
  cartaoId: string | null;
  contaDestinoId: string | null;
  faturaChave: string | null;
  pago: boolean;
  recorrenciaId: string | null;
  parcelaGrupoId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  createdAt: Date;
  contaNome: string | null;
  cartaoNome: string | null;
};

export type DuplicateScan = {
  exact: DuplicateGroup<DuplicateTransactionRow>[];
  repeated: RepeatedGroup<DuplicateTransactionRow>[];
};

/** Encontra duplicados exatos e possíveis repetições órfãs. */
export function listDuplicateTransactions(
  workspaceId: string,
): DuplicateScan {
  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      descricao: transactions.descricao,
      data: transactions.data,
      valor: transactions.valor,
      contaId: transactions.contaId,
      cartaoId: transactions.cartaoId,
      contaDestinoId: transactions.contaDestinoId,
      faturaChave: transactions.faturaChave,
      pago: transactions.pago,
      recorrenciaId: transactions.recorrenciaId,
      parcelaGrupoId: transactions.parcelaGrupoId,
      parcelaAtual: transactions.parcelaAtual,
      parcelaTotal: transactions.parcelaTotal,
      createdAt: transactions.createdAt,
      contaNome: accounts.nome,
      cartaoNome: creditCards.nome,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.contaId, accounts.id))
    .leftJoin(creditCards, eq(transactions.cartaoId, creditCards.id))
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.data), desc(transactions.createdAt))
    .all();

  const exact = groupDuplicates(rows);
  const exactIds = new Set(
    exact.flatMap((group) => group.items.map((item) => item.id)),
  );
  return {
    exact,
    repeated: groupRepeated(rows, exactIds),
  };
}
