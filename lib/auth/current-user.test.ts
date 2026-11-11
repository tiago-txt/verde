import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "@/lib/db/testing";
import { users } from "@/lib/db/schema";
import { createSessionToken } from "./jwt";

const state = vi.hoisted(() => ({ token: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.token ? { value: state.token } : undefined),
    set: () => {},
    delete: () => {},
  }),
}));

let testDb: TestDatabase;
let active: TestUser;
let inactive: TestUser;

async function tokenFor(user: TestUser, workspaceId = user.workspaceId) {
  return createSessionToken({
    userId: user.id,
    workspaceId,
    role: user.role,
    email: user.email,
    nome: user.nome,
    isAdmin: user.role === "admin",
  });
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  active = createWorkspaceUser(testDb, {
    nome: "Ativo",
    email: "ativo@verde.local",
    role: "admin",
  });
  inactive = createWorkspaceUser(testDb, {
    nome: "Inativo",
    email: "inativo@verde.local",
    role: "membro",
    ativo: false,
  });
  state.token = null;
});

afterEach(() => {
  state.token = null;
  resetTestDatabase();
});

describe("sessão e usuário atual", () => {
  it("retorna o usuário ativo a partir do token", async () => {
    state.token = await tokenFor(active);
    const { getCurrentUser } = await import("./current-user");
    const user = await getCurrentUser();
    expect(user?.id).toBe(active.id);
    expect(user?.workspaceId).toBe(active.workspaceId);
  });

  it("invalida a sessão de usuário inativo", async () => {
    state.token = await tokenFor(inactive);
    const { getCurrentUser } = await import("./current-user");
    expect(await getCurrentUser()).toBeNull();
  });

  it("invalida a sessão quando o usuário é desativado depois do login", async () => {
    state.token = await tokenFor(active);
    const { getCurrentUser } = await import("./current-user");
    expect((await getCurrentUser())?.id).toBe(active.id);

    testDb.db
      .update(users)
      .set({ ativo: false })
      .where(eq(users.id, active.id))
      .run();

    // Em Next, o cache é por requisição. Aqui recarregamos o módulo para
    // simular a próxima requisição e garantir a checagem no banco.
    vi.resetModules();
    const fresh = await import("./current-user");
    expect(await fresh.getCurrentUser()).toBeNull();
  });

  it("rejeita token de outro workspace", async () => {
    state.token = await tokenFor(active, inactive.workspaceId);
    const { getCurrentUser } = await import("./current-user");
    expect(await getCurrentUser()).toBeNull();
  });
});
