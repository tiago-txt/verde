const BUDGET_DETAIL_KEY = "verde:budget-detail-scroll";

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Guarda a posição da lista antes de abrir uma compra do orçamento. */
export function rememberBudgetDetailScroll(y: number): void {
  const store = session();
  if (!store) return;
  try {
    store.setItem(BUDGET_DETAIL_KEY, String(Math.max(0, Math.round(y))));
  } catch {
    // Sem sessionStorage, apenas não restaura.
  }
}

/** Lê e apaga a posição guardada, para não reaplicar em outra visita. */
export function takeBudgetDetailScroll(): number | null {
  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(BUDGET_DETAIL_KEY);
    if (raw === null) return null;
    store.removeItem(BUDGET_DETAIL_KEY);
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}
