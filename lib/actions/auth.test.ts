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
import {
  accounts,
  categories,
  tags,
  transactions,
  users,
  workspaces,
  type User,
} from "@/lib/db/schema";
import { loginAction } from "@/lib/actions/auth";
import {
  createDemoAccountAction,
  createUserAction,
  deleteUserAction,
  setUserActiveAction,
  signupAction,
} from "@/lib/actions/users";

const state = vi.hoisted(() => ({
  user: null as User | null,
  ip: "10.0.0.1",
  session: null as {
    userId: string;
    workspaceId: string;
    role: string;
    email: string;
    nome: string;
    isAdmin: boolean;
  } | null,
}));

vi.mock("@/lib/auth/session", () => ({
  startSession: async (payload: typeof state.session) => {
    state.session = payload;
  },
  endSession: async () => {},
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireSessionUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireAdmin: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": state.ip }),
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

let testDb: TestDatabase;
let admin: TestUser;
let member: TestUser;
let ipSeed = 0;

function setCurrent(user: TestUser | null) {
  state.user = user
    ? (testDb.db.select().from(users).where(eq(users.id, user.id)).get() ?? null)
    : null;
}

function loginForm(email: string, senha: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("senha", senha);
  return form;
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  admin = createWorkspaceUser(testDb, {
    nome: "Admin",
    email: "admin@verde.local",
    role: "admin",
  });
  member = createWorkspaceUser(testDb, {
    nome: "Membro",
    email: "membro@verde.local",
    role: "membro",
  });
  ipSeed += 1;
  state.ip = `10.0.0.${ipSeed}`;
  state.session = null;
  delete process.env.ALLOW_SIGNUP;
  delete process.env.ADMIN_TRUSTED_NETWORKS;
  setCurrent(admin);
});

afterEach(() => {
  state.user = null;
  delete process.env.ADMIN_TRUSTED_NETWORKS;
  resetTestDatabase();
});

describe("autenticação multiusuário", () => {
  it("cria sessão com userId, workspaceId e role no login ativo", async () => {
    let redirectError: unknown = null;
    try {
      await loginAction({}, loginForm(admin.email, "senha12345"));
    } catch (error) {
      redirectError = error;
    }

    expect(redirectError).toBeTruthy();
    expect(state.session).toMatchObject({
      userId: admin.id,
      workspaceId: admin.workspaceId,
      role: "admin",
    });
  });

  it("força a troca de senha no primeiro login com senha temporária", async () => {
    testDb.db
      .update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, member.id))
      .run();

    let redirectError: { digest?: string } | null = null;
    try {
      await loginAction({}, loginForm(member.email, "senha12345"));
    } catch (error) {
      redirectError = error as { digest?: string };
    }

    expect(redirectError?.digest ?? "").toContain("/trocar-senha");
  });

  it("não autentica usuário inativo e usa mensagem genérica", async () => {
    testDb.db
      .update(users)
      .set({ ativo: false })
      .where(eq(users.id, member.id))
      .run();

    const result = await loginAction({}, loginForm(member.email, "senha12345"));
    expect(result.error).toBe("E-mail ou senha incorretos.");
  });

  it("bloqueia login de administrador fora da rede confiável", async () => {
    state.ip = "203.0.113.9";

    const result = await loginAction({}, loginForm(admin.email, "senha12345"));

    expect(result.error).toContain("administrador");
    expect(result.error).toContain("rede local");
    expect(state.session).toBeNull();
  });

  it("permite administrador em IP liberado por ADMIN_TRUSTED_NETWORKS", async () => {
    state.ip = "203.0.113.9";
    process.env.ADMIN_TRUSTED_NETWORKS = "203.0.113.0/24";

    let redirectError: unknown = null;
    try {
      await loginAction({}, loginForm(admin.email, "senha12345"));
    } catch (error) {
      redirectError = error;
    }

    expect(redirectError).toBeTruthy();
    expect(state.session).toMatchObject({
      userId: admin.id,
      role: "admin",
    });
  });

  it("não restringe o login de membros pela rede", async () => {
    state.ip = "203.0.113.9";

    let redirectError: unknown = null;
    try {
      await loginAction({}, loginForm(member.email, "senha12345"));
    } catch (error) {
      redirectError = error;
    }

    expect(redirectError).toBeTruthy();
    expect(state.session).toMatchObject({
      userId: member.id,
      role: "membro",
    });
  });

  it("limita tentativas por e-mail e por IP", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await loginAction(
        {},
        loginForm("ninguem@verde.local", "senha-errada"),
      );
      expect(result.error).toBe("E-mail ou senha incorretos.");
    }

    const blocked = await loginAction(
      {},
      loginForm("ninguem@verde.local", "senha-errada"),
    );
    expect(blocked.error).toContain("Muitas tentativas");
  });

  it("bloqueia cadastro público quando ALLOW_SIGNUP=false", async () => {
    const result = await signupAction({}, new FormData());
    expect(result.error).toContain("desabilitado");
  });

  it("impede desativar a si mesmo e o último administrador", async () => {
    const self = await setUserActiveAction({
      id: admin.id,
      ativo: false,
    });
    expect(self).toMatchObject({ ok: false });

    // Ator sem privilégio real (requireAdmin mockado) tentando desativar o
    // único admin ativo: a regra de negócio ainda protege.
    setCurrent(member);
    const lastAdmin = await setUserActiveAction({
      id: admin.id,
      ativo: false,
    });
    expect(lastAdmin).toMatchObject({ ok: false });
    expect(lastAdmin.ok ? "" : lastAdmin.error).toContain("administrador");
  });

  it("cria usuário com workspace, categorias/tags padrão e senha temporária", async () => {
    setCurrent(admin);
    const result = await createUserAction({
      nome: "Novo Usuário",
      email: "novo@verde.local",
      role: "membro",
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.notice?.message : "").toContain("Senha temporária");

    const created = testDb.db
      .select()
      .from(users)
      .where(eq(users.email, "novo@verde.local"))
      .get();
    expect(created).toBeTruthy();
    expect(created?.mustChangePassword).toBe(true);
    expect(created?.workspaceId).toBeTruthy();

    const categoryCount = testDb.db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, created!.workspaceId))
      .all();
    const tagCount = testDb.db
      .select()
      .from(tags)
      .where(eq(tags.workspaceId, created!.workspaceId))
      .all();
    expect(categoryCount.length).toBeGreaterThan(0);
    expect(tagCount.length).toBeGreaterThan(0);
    expect(
      categoryCount.filter((category) => category.isSystem),
    ).toHaveLength(2);
  });

  it("cria conta demo isolada com dados de exemplo e senha compartilhável", async () => {
    setCurrent(admin);
    const result = await createDemoAccountAction();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.email).toContain("@verde.local");
    expect(result.senha.length).toBeGreaterThan(8);

    const demoUser = testDb.db
      .select()
      .from(users)
      .where(eq(users.email, result.email))
      .get();
    expect(demoUser).toMatchObject({
      nome: "Conta Demo",
      role: "membro",
      ativo: true,
      mustChangePassword: false,
    });

    const demoAccounts = testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, demoUser!.workspaceId))
      .all();
    const demoTransactions = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, demoUser!.workspaceId))
      .all();

    expect(demoAccounts.length).toBeGreaterThanOrEqual(3);
    expect(demoAccounts.some((account) => account.nome.includes("(Demo)"))).toBe(
      true,
    );
    expect(demoTransactions.length).toBeGreaterThan(0);
  });

  it("exclui usuário e todo o workspace (dados isolados)", async () => {
    setCurrent(admin);
    const created = await createUserAction({
      nome: "Descartável",
      email: "desc@verde.local",
      senha: "senha12345",
      role: "membro",
    });
    expect(created.ok).toBe(true);

    const target = testDb.db
      .select()
      .from(users)
      .where(eq(users.email, "desc@verde.local"))
      .get();
    if (!target) throw new Error("usuário alvo");

    testDb.db
      .insert(accounts)
      .values({
        id: crypto.randomUUID(),
        workspaceId: target.workspaceId,
        nome: "Conta do descartável",
        tipo: "corrente",
      })
      .run();

    const wrong = await deleteUserAction({
      id: target.id,
      confirmacao: "outro@email.local",
    });
    expect(wrong).toMatchObject({ ok: false });

    const result = await deleteUserAction({
      id: target.id,
      confirmacao: target.email,
    });
    expect(result.ok).toBe(true);

    expect(
      testDb.db.select().from(users).where(eq(users.id, target.id)).get(),
    ).toBeUndefined();
    expect(
      testDb.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, target.workspaceId))
        .get(),
    ).toBeUndefined();
    expect(
      testDb.db
        .select()
        .from(accounts)
        .where(eq(accounts.workspaceId, target.workspaceId))
        .all(),
    ).toHaveLength(0);
  });
});
