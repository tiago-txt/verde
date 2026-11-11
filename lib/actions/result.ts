import type { BudgetNotice } from "@/lib/db/queries/budgets";

export type ActionResult =
  | {
      ok: true;
      id?: string;
      count?: number;
      ignored?: number;
      budgetNotice?: BudgetNotice;
    }
  | { ok: false; error: string; code?: string; ignored?: number };
