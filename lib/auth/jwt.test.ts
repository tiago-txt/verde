import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./jwt";

const payload: SessionPayload = {
  userId: "user-1",
  workspaceId: "workspace-1",
  role: "admin",
  email: "teste@verde.local",
  nome: "Teste",
  isAdmin: true,
};

describe("sessão assinada", () => {
  it("cria e verifica um token válido", async () => {
    const token = await createSessionToken(payload);
    const session = await verifySessionToken(token);

    expect(session).toEqual(payload);
  });

  it("rejeita token adulterado", async () => {
    const token = await createSessionToken(payload);
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.assinatura-invalida`;

    expect(await verifySessionToken(tampered)).toBeNull();
  });

  it("rejeita token com formato inválido", async () => {
    expect(await verifySessionToken("não-é-um-jwt")).toBeNull();
  });
});
