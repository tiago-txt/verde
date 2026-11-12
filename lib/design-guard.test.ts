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
});
