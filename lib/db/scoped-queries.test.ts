import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const DOMAIN_TABLES = [
  "accounts",
  "creditCards",
  "categories",
  "tags",
  "transactions",
  "transactionTags",
  "recurrences",
  "budgets",
  "budgetCategories",
  "budgetOverrides",
];

const SCOPED_LAYER_PREFIXES = ["lib/db/queries/", "lib/actions/"];

/** Arquivos de infraestrutura/auth que podem falar com o banco diretamente. */
const RAW_DB_ALLOWLIST = new Set([
  "lib/db/index.ts",
  "lib/db/init.ts",
  "lib/db/scoped.ts",
  "lib/db/testing.ts",
  "lib/db/seed-demo.ts",
  "lib/db/seed-workspace.ts",
  "lib/db/queries/users.ts",
  "lib/actions/auth.ts",
  "lib/auth/current-user.ts",
  "app/api/health/route.ts",
]);

function walk(dir: string): string[] {
  const entries = fs.readdirSync(path.join(ROOT, dir), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = `${dir}/${entry.name}`.replace(/\\/g, "/");
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...walk(relative));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

function sourceFiles(): string[] {
  return [
    ...walk("lib"),
    ...walk("app"),
    ...walk("components"),
  ];
}

function isScopedLayer(file: string): boolean {
  return SCOPED_LAYER_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function domainCalls(source: string): string[] {
  return DOMAIN_TABLES.filter((table) =>
    new RegExp(
      `\\.(from|insert|update|delete|innerJoin|leftJoin|rightJoin)\\(\\s*${table}\\b`,
    ).test(source),
  );
}

function importsRawDb(source: string): boolean {
  return /from\s+["']@\/lib\/db["']/.test(source) &&
    /\b(getDb|getSqlite)\b/.test(source);
}

describe("varredura de queries com escopo", () => {
  const files = sourceFiles();

  it("nenhum arquivo fora da camada com escopo acessa tabelas de domínio", () => {
    const violations: string[] = [];

    for (const file of files) {
      if (isScopedLayer(file)) continue;
      if (RAW_DB_ALLOWLIST.has(file)) continue;

      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      if (importsRawDb(source)) {
        violations.push(`${file}: importa getDb/getSqlite fora da camada`);
      }
      const tables = domainCalls(source);
      if (tables.length > 0) {
        violations.push(
          `${file}: consulta direta de ${tables.join(", ")} fora da camada`,
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("toda query/action de domínio passa por scopedDb", () => {
    const violations: string[] = [];

    for (const file of files) {
      if (!isScopedLayer(file)) continue;
      if (RAW_DB_ALLOWLIST.has(file)) continue;
      if (file.endsWith("result.ts")) continue;

      const source = fs.readFileSync(path.join(ROOT, file), "utf8");
      const tables = domainCalls(source);
      if (tables.length === 0) continue;

      if (!source.includes("scopedDb(")) {
        violations.push(`${file}: usa tabela de domínio sem scopedDb`);
      }
      if (/\bgetDb\s*\(/.test(source)) {
        violations.push(`${file}: usa getDb diretamente (use scopedDb)`);
      }
      if (!source.includes("workspaceId")) {
        violations.push(`${file}: não referencia workspaceId`);
      }
    }

    expect(violations).toEqual([]);
  });
});
