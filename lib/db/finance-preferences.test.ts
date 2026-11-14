import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import {
  getCardBasis,
  getFinancePreferences,
  saveFinancePreferences,
} from "./queries/finance-preferences";

let testDb: TestDatabase;
let user: TestUser;

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@example.com",
  });
});

afterEach(() => {
  resetTestDatabase();
});

describe("preferência de cartão por usuário", () => {
  it("sem registro, o padrão é caixa", () => {
    expect(getFinancePreferences(user.workspaceId, user.id)).toEqual({
      cardBasis: "caixa",
    });
  });

  it("salva competência e persiste após recarregar", () => {
    saveFinancePreferences(user.workspaceId, user.id, {
      cardBasis: "competencia",
    });
    // Nova leitura simula um reload da página.
    expect(getCardBasis(user.workspaceId, user.id)).toBe("competencia");

    saveFinancePreferences(user.workspaceId, user.id, { cardBasis: "caixa" });
    expect(getCardBasis(user.workspaceId, user.id)).toBe("caixa");
  });

  it("não vaza a preferência para outro usuário", () => {
    const outro = createWorkspaceUser(testDb, {
      nome: "Bia",
      email: "bia@example.com",
    });
    saveFinancePreferences(user.workspaceId, user.id, {
      cardBasis: "competencia",
    });
    expect(getCardBasis(user.workspaceId, outro.id)).toBe("caixa");
  });
});
