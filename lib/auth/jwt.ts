import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@/lib/db/schema";

export const SESSION_COOKIE = "verde_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

export type SessionPayload = {
  userId: string;
  workspaceId: string;
  role: UserRole;
  email: string;
  nome: string;
  isAdmin: boolean;
};

const DEV_SECRET =
  "verde-dev-secret-inseguro-nao-use-em-producao-1234567890";

/**
 * Módulo seguro para Edge (middleware) e Node.
 * Não importa nada de `next/headers` nem `node:*`.
 */
function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  const isPlaceholder = secret?.startsWith("troque-por-");
  if (secret && secret.length >= 32 && !isPlaceholder) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET ausente, curto ou ainda com valor de exemplo. Defina um segredo forte no .env.",
    );
  }
  return new TextEncoder().encode(DEV_SECRET);
}

export async function createSessionToken(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({
    email: payload.email,
    nome: payload.nome,
    workspaceId: payload.workspaceId,
    role: payload.role,
    isAdmin: payload.isAdmin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (
      !payload.sub ||
      typeof payload.email !== "string" ||
      typeof payload.workspaceId !== "string" ||
      (payload.role !== "admin" && payload.role !== "membro")
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      role: payload.role,
      email: payload.email,
      nome: typeof payload.nome === "string" ? payload.nome : "",
      isAdmin: payload.role === "admin",
    };
  } catch {
    return null;
  }
}
