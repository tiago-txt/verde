import { eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getDb } from "./index";

export type Db = ReturnType<typeof getDb>;

export type ScopedDb = {
  db: Db;
  workspaceId: string;
  /**
   * Filtro de workspace obrigatório. Use sempre que consultar/gravar uma
   * tabela de domínio: `where(and(scope.ws(accounts.workspaceId), ...))`.
   */
  ws: (column: SQLiteColumn) => SQL;
};

/**
 * Camada única de acesso a dados com escopo.
 *
 * O `workspaceId` deve vir SEMPRE da sessão no servidor (nunca de params,
 * formulário ou body). Todas as queries e actions de domínio recebem esse
 * valor e usam `scopedDb(workspaceId)` — o teste `scoped-queries.test.ts`
 * falha se `getDb` for usado diretamente fora daqui.
 */
export function scopedDb(workspaceId: string): ScopedDb {
  return {
    db: getDb(),
    workspaceId,
    ws: (column) => eq(column, workspaceId),
  };
}
