import { and, eq } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import { financePreferences } from "@/lib/db/schema";
import {
  DEFAULT_CARD_BASIS,
  normalizeCardBasis,
  type CardBasis,
} from "@/lib/finance/result";

export type FinancePreferences = {
  cardBasis: CardBasis;
};

/** Preferência por usuário; sem registro, "caixa" (padrão do produto). */
export function getFinancePreferences(
  workspaceId: string,
  userId: string,
): FinancePreferences {
  const { db, ws } = scopedDb(workspaceId);
  const row = db
    .select({ cardBasis: financePreferences.cardBasis })
    .from(financePreferences)
    .where(
      and(
        eq(financePreferences.userId, userId),
        ws(financePreferences.workspaceId),
      ),
    )
    .get();

  return {
    cardBasis: row ? normalizeCardBasis(row.cardBasis) : DEFAULT_CARD_BASIS,
  };
}

export function getCardBasis(workspaceId: string, userId: string): CardBasis {
  return getFinancePreferences(workspaceId, userId).cardBasis;
}

export function saveFinancePreferences(
  workspaceId: string,
  userId: string,
  prefs: FinancePreferences,
): void {
  const { db, ws } = scopedDb(workspaceId);
  const cardBasis = normalizeCardBasis(prefs.cardBasis);

  db.insert(financePreferences)
    .values({
      userId,
      workspaceId,
      cardBasis,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: financePreferences.userId,
      set: { cardBasis, updatedAt: new Date() },
      where: ws(financePreferences.workspaceId),
    })
    .run();
}
