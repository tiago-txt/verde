#!/usr/bin/env node
/**
 * Backup seguro do SQLite usando a API de backup do better-sqlite3
 * (funciona com WAL e não bloqueia o app).
 *
 * Uso:
 *   node scripts/backup.mjs
 *   docker compose exec -T verde node scripts/backup.mjs
 *
 * Variáveis: DATABASE_PATH, BACKUP_DIR, BACKUP_KEEP
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = path.resolve(process.env.DATABASE_PATH ?? "./data/verde.db");
const backupDir = path.resolve(
  process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), "backups"),
);
const keep = Math.max(1, Number(process.env.BACKUP_KEEP ?? 14) || 14);

if (!fs.existsSync(dbPath)) {
  console.error(`[backup] Banco não encontrado em ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-")
  .slice(0, 19);
const destination = path.join(backupDir, `verde-${stamp}.db`);

const db = new Database(dbPath, { readonly: true, fileMustExist: true });
try {
  await db.backup(destination);
  console.log(`[backup] Criado: ${destination}`);
} finally {
  db.close();
}

// Remove os backups mais antigos, mantendo os N mais recentes.
const backups = fs
  .readdirSync(backupDir)
  .filter((file) => /^verde-.*\.db$/.test(file))
  .sort()
  .reverse();

for (const old of backups.slice(keep)) {
  fs.unlinkSync(path.join(backupDir, old));
  console.log(`[backup] Removido antigo: ${old}`);
}

console.log(`[backup] ${Math.min(backups.length, keep)} arquivo(s) mantido(s).`);
