import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "./seed-data";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verde-init-"));
const dbPath = path.join(tempDir, "verde.db");

process.env.DATABASE_PATH = dbPath;
process.env.ADMIN_EMAIL = "boot@verde.local";
process.env.ADMIN_PASSWORD = "boot12345";
process.env.ADMIN_NAME = "Boot Admin";
process.env.SESSION_SECRET = "x".repeat(48);
process.env.SEED_DEMO = "false";

function count(sqlite: Database.Database, table: string): number {
  return (
    sqlite.prepare(`select count(*) as total from ${table}`).get() as {
      total: number;
    }
  ).total;
}

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("primeiro boot", () => {
  it("cria admin, workspace e seeds por workspace de forma idempotente", async () => {
    const { initializeDatabase } = await import("./init");
    initializeDatabase();

    const sqlite = new Database(dbPath, { readonly: true });
    const expectedCategories = DEFAULT_CATEGORIES.reduce(
      (total, category) => total + 1 + (category.filhos?.length ?? 0),
      0,
    );

    expect(count(sqlite, "users")).toBe(1);
    expect(count(sqlite, "workspaces")).toBe(1);
    expect(count(sqlite, "categories")).toBe(expectedCategories);
    expect(count(sqlite, "tags")).toBe(DEFAULT_TAGS.length);

    const admin = sqlite
      .prepare("select email, role, is_admin, ativo, workspace_id from users")
      .get() as {
      email: string;
      role: string;
      is_admin: number;
      ativo: number;
      workspace_id: string;
    };
    expect(admin).toMatchObject({
      email: "boot@verde.local",
      role: "admin",
      is_admin: 1,
      ativo: 1,
    });

    const workspace = sqlite
      .prepare("select id from workspaces where id = ?")
      .get(admin.workspace_id);
    expect(workspace).toBeTruthy();

    const systemCategories = sqlite
      .prepare(
        "select tipo, count(*) as total from categories where is_system = 1 group by tipo",
      )
      .all() as { tipo: string; total: number }[];
    expect(systemCategories).toHaveLength(2);
    expect(systemCategories.every((row) => row.total === 1)).toBe(true);

    sqlite.close();

    // Simula um novo boot no mesmo banco: seeds não duplicam nada.
    (globalThis as typeof globalThis & { __verdeDbInitialized?: boolean })
      .__verdeDbInitialized = false;
    initializeDatabase();

    const again = new Database(dbPath, { readonly: true });
    expect(count(again, "users")).toBe(1);
    expect(count(again, "workspaces")).toBe(1);
    expect(count(again, "categories")).toBe(expectedCategories);
    expect(count(again, "tags")).toBe(DEFAULT_TAGS.length);
    again.close();
  });
});
