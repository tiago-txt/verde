import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function filesIn(root: string, extensions: string[]): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...filesIn(full, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      result.push(full);
    }
  }
  return result;
}

const sourceFiles = [
  ...filesIn(path.join(process.cwd(), "app"), [".ts", ".tsx"]),
  ...filesIn(path.join(process.cwd(), "components"), [".ts", ".tsx"]),
  ...filesIn(path.join(process.cwd(), "lib"), [".ts", ".tsx"]),
].filter((file) => !file.endsWith("design-guard.test.ts"));

describe("guarda de design", () => {
  it("não usa dependências visuais externas em runtime", () => {
    const forbidden = [
      "fonts.googleapis",
      "cdn.tailwindcss",
      "googleusercontent",
      "material-symbols",
    ];
    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(
          content.includes(token),
          `${path.relative(process.cwd(), file)} contém ${token}`,
        ).toBe(false);
      }
    }
  });

  it("não usa texto abaixo de 12px nem fora da escala", () => {
    const allowed = new Set(["12", "13", "15", "18", "20", "24", "28", "32", "34", "48"]);
    for (const file of sourceFiles.filter((item) => item.endsWith(".tsx"))) {
      const content = fs.readFileSync(file, "utf8");
      const sizes = [...content.matchAll(/text-\[([0-9]+)px\]/g)].map(
        (match) => match[1],
      );
      for (const size of sizes) {
        expect(
          allowed.has(size as string),
          `${path.relative(process.cwd(), file)} usa text-[${size}px] fora da escala`,
        ).toBe(true);
      }
    }
  });

  it("mantém o baseline de tamanhos arbitrários", () => {
    const count = sourceFiles
      .filter((item) => item.endsWith(".tsx"))
      .reduce((total, file) => {
        const content = fs.readFileSync(file, "utf8");
        return total + (content.match(/text-\[[0-9]+px\]/g)?.length ?? 0);
      }, 0);
    expect(count).toBeLessThanOrEqual(8);
  });

  it("só o resolvedor importa Tile diretamente", () => {
    const allowed = new Set([
      path.join(process.cwd(), "components", "entity-tile.tsx"),
      path.join(process.cwd(), "lib", "design", "tile-spec.ts"),
    ]);
    for (const file of sourceFiles) {
      if (allowed.has(file)) continue;
      const content = fs.readFileSync(file, "utf8");
      expect(
        content.includes('from "@/components/tile"'),
        `${path.relative(process.cwd(), file)} importa Tile fora do resolvedor`,
      ).toBe(false);
    }
  });

  it("define os tokens de decoração nos três níveis e nos dois temas", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "app", "globals.css"),
      "utf8",
    );
    for (const token of [
      "--deco-corner-opacity",
      "--deco-emblem-opacity",
      "--deco-pattern-opacity",
      "--deco-hero-pattern-opacity",
      "--tile-surface",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain(".light");
    expect(css).toContain(".dark");
    expect(css).toContain(".light .tile-entity");
    expect(css).toContain('[data-decorations="normais"]');
    expect(css).toContain('[data-decorations="off"]');
  });

  it("mantém fatura e orçamento no mesmo container dos lançamentos", () => {
    for (const relative of [
      "components/transactions/budget-event-row.tsx",
      "components/transactions/card-invoice-row.tsx",
    ]) {
      const content = fs.readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(content).toContain("min-h-[72px]");
      expect(content).toContain("bg-surface-low");
      expect(content).toContain("border-dashed");
      expect(content).toContain("EntityTile");
      expect(content).toContain("row-value");
      expect(content).toContain("row-title");
      expect(content).toContain("row-slot");
    }
    const invoice = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/transactions/card-invoice-row.tsx",
      ),
      "utf8",
    );
    expect(invoice).toContain("Banknote");
    expect(invoice).toContain('variant="outline"');
  });
});
