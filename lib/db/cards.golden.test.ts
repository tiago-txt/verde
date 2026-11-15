// Congela o comportamento aprovado pelo dono; não editar para passar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import { accounts, creditCards, transactions } from "./schema";
import {
  getCardInvoiceDetail,
  listCardInvoiceEventsForMonth,
} from "./queries/cards";
import { listReportRows } from "./queries/reports";
import type { CardInvoiceFilters } from "@/lib/finance/cards";
import type { ReportFilters } from "@/lib/finance/report-filters";

const TODAY = "2026-11-15";

const CARD_FILTERS: CardInvoiceFilters = {
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
};

const REPORT_FILTERS: ReportFilters = {
  aba: "categoria",
  periodo: "mes",
  tipo: "despesa",
  mes: "2026-11",
  de: null,
  ate: null,
  contas: [],
  cartoes: [],
  categorias: [],
  tags: [],
  onlyPaid: false,
  range: { from: "2026-11-01", to: "2026-11-30" },
};

let testDb: TestDatabase;
let user: TestUser;
let accountId: string;
let cardId: string;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Fixture",
    email: "fixture@verde.local",
    role: "membro",
  });
  accountId = crypto.randomUUID();
  cardId = crypto.randomUUID();
  const now = new Date(`${TODAY}T12:00:00Z`);
  testDb.db
    .insert(accounts)
    .values({
      id: accountId,
      workspaceId: user.workspaceId,
      nome: "Conta",
      tipo: "corrente",
      saldoInicial: 100_000,
      cor: "#34d399",
      icone: "Wallet",
      arquivada: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  testDb.db
    .insert(creditCards)
    .values({
      id: cardId,
      workspaceId: user.workspaceId,
      nome: "Cartão",
      bandeira: "visa",
      limite: 500_000,
      diaFechamento: 9,
      diaVencimento: 15,
      fechamentoCompra: "proxima_fatura",
      contaPagamentoId: accountId,
      cor: "#818cf8",
      icone: "CreditCard",
      arquivado: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
});

afterEach(() => {
  vi.useRealTimers();
  resetTestDatabase();
});

function tx(values: {
  id?: string;
  tipo: "despesa" | "receita" | "transferencia";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  cartaoId?: string | null;
  cartaoDestinoId?: string | null;
  faturaChave?: string | null;
}) {
  const id = values.id ?? crypto.randomUUID();
  const now = new Date(`${TODAY}T12:00:00Z`);
  testDb.db
    .insert(transactions)
    .values({
      id,
      workspaceId: user.workspaceId,
      tipo: values.tipo,
      descricao: values.descricao,
      valor: values.valor,
      data: values.data,
      pago: values.pago,
      contaId: values.tipo === "transferencia" ? accountId : null,
      cartaoId: values.cartaoId ?? null,
      contaDestinoId: null,
      cartaoDestinoId: values.cartaoDestinoId ?? null,
      faturaChave: values.faturaChave ?? null,
      categoriaId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("restante, pagamento vinculado e linha única", () => {
  it("restante = total - pagamentos vinculados, com piso zero", () => {
    tx({
      tipo: "despesa",
      descricao: "Compra da fatura de novembro",
      valor: 10_000,
      data: "2026-10-20",
      pago: false,
      cartaoId: cardId,
    });
    tx({
      tipo: "transferencia",
      descricao: "Pagamento parcial",
      valor: 6_000,
      data: "2026-11-10",
      pago: true,
      cartaoDestinoId: cardId,
      faturaChave: "2026-11",
    });
    tx({
      tipo: "transferencia",
      descricao: "Pagamento excedente",
      valor: 6_000,
      data: "2026-11-11",
      pago: true,
      cartaoDestinoId: cardId,
      faturaChave: "2026-11",
    });

    const detail = getCardInvoiceDetail(user.workspaceId, cardId, "2026-11");
    expect(detail?.fatura).toMatchObject({
      total: 10_000,
      pago: 12_000,
      restante: 0,
      credito: 2_000,
      status: "paga",
    });
    expect(detail?.fatura.vencida).toBe(false);
  });

  it("a linha da fatura permanece na lista depois de paga", () => {
    tx({
      tipo: "despesa",
      descricao: "Compra da fatura de novembro",
      valor: 10_000,
      data: "2026-10-20",
      pago: false,
      cartaoId: cardId,
    });
    tx({
      tipo: "transferencia",
      descricao: "Pagamento total",
      valor: 10_000,
      data: "2026-11-10",
      pago: true,
      cartaoDestinoId: cardId,
      faturaChave: "2026-11",
    });

    const events = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2026-11",
      CARD_FILTERS,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      faturaChave: "2026-11",
      total: 10_000,
      pago: 10_000,
      restante: 0,
      status: "paga",
    });
    expect(events[0]?.pagamentos[0]?.valor).toBe(10_000);
  });
});

describe("FIFO de pagamentos sem fatura_chave", () => {
  it("aloca o pagamento antigo na fatura mais antiga em aberto", () => {
    tx({
      tipo: "despesa",
      descricao: "Compra de novembro",
      valor: 10_000,
      data: "2026-10-20",
      pago: false,
      cartaoId: cardId,
    });
    tx({
      tipo: "despesa",
      descricao: "Compra de dezembro",
      valor: 5_000,
      data: "2026-11-20",
      pago: false,
      cartaoId: cardId,
    });
    tx({
      tipo: "transferencia",
      descricao: "Pagamento antigo sem vínculo",
      valor: 12_000,
      data: "2026-11-10",
      pago: true,
      cartaoDestinoId: cardId,
      faturaChave: null,
    });

    const nov = getCardInvoiceDetail(user.workspaceId, cardId, "2026-11");
    const dez = getCardInvoiceDetail(user.workspaceId, cardId, "2026-12");
    expect(nov?.fatura).toMatchObject({
      total: 10_000,
      pago: 10_000,
      restante: 0,
    });
    expect(dez?.fatura).toMatchObject({
      total: 5_000,
      pago: 2_000,
      restante: 3_000,
    });
  });
});

describe("relatórios ignoram pagamento de fatura", () => {
  it("transferência vinculada ao cartão não aparece como despesa/receita", () => {
    tx({
      tipo: "transferencia",
      descricao: "Pagamento de fatura",
      valor: 10_000,
      data: "2026-11-10",
      pago: true,
      cartaoDestinoId: cardId,
      faturaChave: "2026-11",
    });
    tx({
      tipo: "despesa",
      descricao: "Compra no cartão",
      valor: 10_000,
      data: "2026-11-05",
      pago: false,
      cartaoId: cardId,
    });

    const rows = listReportRows(user.workspaceId, REPORT_FILTERS);
    expect(rows.every((row) => row.tipo !== "transferencia")).toBe(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tipo: "despesa",
      valor: 10_000,
      data: "2026-11-05",
    });
  });
});
