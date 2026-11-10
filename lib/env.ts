import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido");

/**
 * Segredo usado para assinar o cookie de sessão.
 * Em desenvolvimento aceitamos um fallback para não travar o `npm run dev`,
 * mas em produção o app se recusa a subir sem um segredo forte.
 */
export function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET?.trim();
  const isPlaceholder = secret?.startsWith("troque-por-");
  if (secret && secret.length >= 32 && !isPlaceholder) {
    return new TextEncoder().encode(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET ausente, curto ou ainda com valor de exemplo. Defina um segredo forte no .env antes de iniciar em produção.",
    );
  }
  return new TextEncoder().encode(
    "verde-dev-secret-inseguro-nao-use-em-producao-1234567890",
  );
}

export function getAppTimeZone(): string {
  return process.env.TZ?.trim() || "America/Sao_Paulo";
}

export type AdminSeed = {
  email: string;
  password: string;
  nome: string;
};

/**
 * Dados do admin inicial. Retorna null quando as variáveis não foram definidas
 * (permitido apenas se já existir algum usuário no banco).
 */
export function getAdminSeed(): AdminSeed | null {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return null;

  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) {
    throw new Error("ADMIN_EMAIL inválido. Verifique o .env.");
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD deve ter pelo menos 8 caracteres.");
  }
  if (process.env.NODE_ENV === "production" && password.startsWith("troque-esta")) {
    throw new Error(
      "ADMIN_PASSWORD ainda é o valor de exemplo. Defina uma senha forte no .env.",
    );
  }

  return {
    email: parsedEmail.data,
    password,
    nome: process.env.ADMIN_NAME?.trim() || "Administrador",
  };
}

export function getBackupKeep(): number {
  const value = Number(process.env.BACKUP_KEEP ?? "14");
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 14;
}
