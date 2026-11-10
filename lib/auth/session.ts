import { cookies, headers } from "next/headers";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload,
} from "./jwt";

export async function startSession(payload: SessionPayload): Promise<void> {
  const token = await createSessionToken(payload);
  const [store, headerStore] = await Promise.all([cookies(), headers()]);

  // Atrás de Nginx/Caddy/Tailscale o proxy envia x-forwarded-proto.
  // Sem proxy (HTTP na LAN) o cookie precisa funcionar sem Secure.
  const forwardedProto = headerStore
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const secure =
    process.env.COOKIE_SECURE === "true" || forwardedProto === "https";

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
