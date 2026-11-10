import path from "node:path";

/** Caminho absoluto do arquivo SQLite (cria a pasta na inicialização). */
export function getDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim() || "./data/verde.db";
  return path.resolve(configured);
}
