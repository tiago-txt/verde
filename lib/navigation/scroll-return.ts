const BUDGET_DETAIL_KEY = "verde:budget-detail-scroll";
const BUDGET_EVENT_KEY = "verde:budget-event-scroll";

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function remember(key: string, y: number): void {
  const store = session();
  if (!store) return;
  try {
    store.setItem(key, String(Math.max(0, Math.round(y))));
  } catch {
    // Sem sessionStorage, apenas não restaura.
  }
}

function take(key: string): number | null {
  const store = session();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    store.removeItem(key);
    const y = Number(raw);
    return Number.isFinite(y) && y >= 0 ? y : null;
  } catch {
    return null;
  }
}

/** Guarda a posição da lista antes de abrir uma compra do orçamento. */
export function rememberBudgetDetailScroll(y: number): void {
  remember(BUDGET_DETAIL_KEY, y);
}

/** Lê e apaga a posição guardada, para não reaplicar em outra visita. */
export function takeBudgetDetailScroll(): number | null {
  return take(BUDGET_DETAIL_KEY);
}

/** Guarda a posição de Lançamentos antes de editar o orçamento. */
export function rememberBudgetEventScroll(y: number): void {
  remember(BUDGET_EVENT_KEY, y);
}

/** Lê e apaga a posição de Lançamentos guardada. */
export function takeBudgetEventScroll(): number | null {
  return take(BUDGET_EVENT_KEY);
}
