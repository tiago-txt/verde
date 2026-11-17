"use server";

import { requireUser } from "@/lib/auth/current-user";
import {
  listDuplicateTransactions,
  type DuplicateTransactionRow,
} from "@/lib/db/queries/duplicates";

export type DuplicateItemView = Omit<
  DuplicateTransactionRow,
  "createdAt"
> & { createdAt: string };

export type DuplicateGroupView = {
  key: string;
  tipo: string;
  data: string;
  valor: number;
  descricao: string;
  items: DuplicateItemView[];
};

export type RepeatedGroupView = {
  key: string;
  tipo: string;
  descricao: string;
  items: DuplicateItemView[];
};

export type DuplicatesResult =
  | {
      ok: true;
      exact: DuplicateGroupView[];
      repeated: RepeatedGroupView[];
    }
  | { ok: false; error: string };

function toItemView(item: DuplicateTransactionRow): DuplicateItemView {
  return { ...item, createdAt: item.createdAt.toISOString() };
}

export async function findDuplicateTransactionsAction(): Promise<DuplicatesResult> {
  const user = await requireUser();

  try {
    const scan = listDuplicateTransactions(user.workspaceId);
    return {
      ok: true,
      exact: scan.exact.map((group) => ({
        key: group.key,
        tipo: group.tipo,
        data: group.data,
        valor: group.valor,
        descricao: group.descricao,
        items: group.items.map(toItemView),
      })),
      repeated: scan.repeated.map((group) => ({
        key: group.key,
        tipo: group.tipo,
        descricao: group.descricao,
        items: group.items.map(toItemView),
      })),
    };
  } catch (error) {
    console.error("[verde] erro ao procurar duplicados:", error);
    return { ok: false, error: "Não foi possível procurar duplicados." };
  }
}
