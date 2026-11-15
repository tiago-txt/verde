import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import {
  accounts,
  categories,
  creditCards,
  importBatches,
  tags,
  transactions,
  users,
  workspaces,
  type User,
} from "./schema";
import { resetWorkspaceDataAction } from "@/lib/actions/data";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireSessionUser: async () => state.user,
  requireAdmin: async () => state.user,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

let testDb: TestDatabase;
let user: TestUser;

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@verde.local",
    role: "admin",
  });
  state.user =
    testDb.db.select().from(users).where(eq(users.id, user.id)).get() ?? null;

  const now = new Date();
  const accountId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  testDb.db
    .insert(accounts)
    .values({
      id: accountId,
      workspaceId: user.workspaceId,
      nome: "Conta",
      tipo: "corrente",
      saldoInicial: 100_000,
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
      diaFechamento: 10,
      diaVencimento: 17,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  testDb.db
    .insert(transactions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      tipo: "despesa",
      descricao: "Compra",
      valor: 5_000,
      data: "2026-11-10",
      pago: true,
      contaId: accountId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  testDb.db
    .insert(importBatches)
    .values({
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      fileName: "arquivo.xlsx",
      fileHash: "a".repeat(64),
      counts: {
        total: 1,
        imported: 1,
        ignored: 0,
        duplicates: 0,
        invalid: 0,
      },
      createdAt: now,
    })
    .run();
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

function count(table: string) {
  return (
    testDb.sqlite
      .prepare(`select count(*) as total from ${table}`)
      .get() as { total: number }
  ).total;
}

describe("reiniciar dados do workspace", () => {
  it("bloqueia confirmação errada sem apagar nada", async () => {
    const wrong = await resetWorkspaceDataAction({ confirmacao: "sim" });
    expect(wrong.ok).toBe(false);
    expect(count("transactions")).toBe(1);
    expect(count("accounts")).toBe(1);
    expect(count("credit_cards")).toBe(1);
    expect(count("import_batches")).toBe(1);
  });

  it("apaga dados financeiros, mantém usuário e recria categorias/tags padrão", async () => {
    const result = await resetWorkspaceDataAction({ confirmacao: "APAGAR" });
    expect(result).toMatchObject({ ok: true, count: 1 });

    expect(count("transactions")).toBe(0);
    expect(count("accounts")).toBe(0);
    expect(count("credit_cards")).toBe(0);
    expect(count("import_batches")).toBe(0);
    expect(count("users")).toBe(1);
    expect(count("workspaces")).toBe(1);
    expect(count("categories")).toBeGreaterThan(0);
    expect(count("tags")).toBeGreaterThan(0);
  });
});
