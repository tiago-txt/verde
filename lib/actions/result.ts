import type { BudgetNotice } from "@/lib/db/queries/budgets";

export type ActionNotice = {
  tone: "info" | "success" | "warning";
  message: string;
};

export type ActionResult =
  | {
      ok: true;
      id?: string;
      count?: number;
      ignored?: number;
      budgetNotice?: BudgetNotice;
      notice?: ActionNotice;
    }
  | { ok: false; error: string; code?: string; ignored?: number };
