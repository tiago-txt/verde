import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PALETTE,
  PALETTE_OPTIONS,
  PALETTE_STORAGE_KEY,
  parsePalette,
} from "./theme-palette";

const css = fs.readFileSync(
  path.join(process.cwd(), "app", "globals.css"),
  "utf8",
);

const ROOT_SELECTOR = ":root {";
const DARK_SELECTOR = "\n  .dark {";
const ROSE_LIGHT_SELECTOR = ':root[data-palette="rosa"]:not(.dark) {';
const ROSE_DARK_SELECTOR = ':root.dark[data-palette="rosa"] {';

/** Lê as custom properties declaradas em um bloco `seletor { ... }` do CSS. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(selector);
  expect(start, `bloco ${selector} não encontrado`).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  const body = css.slice(open + 1, close);
  const entries: [string, string][] = [];
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const token = match[1];
    const value = match[2];
    if (!token || !value) continue;
    entries.push([token, value.trim()]);
  }
  return new Map(entries);
}

function hue(value: string): number {
  return Number(value.split(/\s+/)[0]);
}

describe("preferência de paleta", () => {
  it("volta para a paleta original com qualquer valor desconhecido", () => {
    expect(DEFAULT_PALETTE).toBe("verde");
    for (const value of [null, undefined, "", "verde", "lilas", "ROSA"]) {
      expect(parsePalette(value)).toBe("verde");
    }
    expect(parsePalette("rosa")).toBe("rosa");
  });

  it("oferece Verde e Rosa pastel, sem ids ou rótulos repetidos", () => {
    const ids = PALETTE_OPTIONS.map((option) => option.id);
    const labels = PALETTE_OPTIONS.map((option) => option.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
    expect(ids).toContain("verde");
    expect(ids).toContain("rosa");
    for (const option of PALETTE_OPTIONS) {
      expect(option.label.trim().length).toBeGreaterThan(0);
      expect(parsePalette(option.id)).toBe(option.id);
    }
  });

  it("guarda a escolha em uma chave que o logout limpa", () => {
    // components/auth/logout-button.tsx remove tudo que começa com "verde".
    expect(PALETTE_STORAGE_KEY.startsWith("verde")).toBe(true);
  });
});

describe("paleta rosa no CSS", () => {
  const base = declarations(ROOT_SELECTOR);
  const light = declarations(ROSE_LIGHT_SELECTOR);
  const dark = declarations(ROSE_DARK_SELECTOR);

  it("não substitui os temas existentes", () => {
    expect(base.get("--background")).toBe("43 50% 93%");
    const darkBase = declarations(DARK_SELECTOR);
    expect(darkBase.get("--background")).toBe("150 31% 6%");
  });

  it("cobre todos os tokens de cor do tema, nos dois modos", () => {
    const required = [...base.keys()].filter(
      (token) => token !== "--radius" && !token.startsWith("--deco-"),
    );
    expect(required.length).toBeGreaterThan(30);
    for (const token of required) {
      expect(light.has(token), `rosa claro sem ${token}`).toBe(true);
      expect(dark.has(token), `rosa escuro sem ${token}`).toBe(true);
    }
  });

  it("não redefine as decorações (Desligadas/Sutis/Normais)", () => {
    for (const token of [...light.keys(), ...dark.keys()]) {
      expect(token.startsWith("--deco-")).toBe(false);
    }
  });

  it("aplica o rosa no destaque e preserva as cores semânticas", () => {
    for (const palette of [light, dark]) {
      expect(hue(palette.get("--primary") ?? "")).toBeGreaterThanOrEqual(320);
      expect(hue(palette.get("--primary") ?? "")).toBeLessThanOrEqual(350);
      for (const token of ["--success", "--emerald"]) {
        expect(hue(palette.get(token) ?? ""), token).toBeGreaterThanOrEqual(120);
        expect(hue(palette.get(token) ?? ""), token).toBeLessThanOrEqual(180);
      }
      for (const token of ["--warning", "--amber", "--gold"]) {
        expect(hue(palette.get(token) ?? ""), token).toBeGreaterThanOrEqual(20);
        expect(hue(palette.get(token) ?? ""), token).toBeLessThanOrEqual(60);
      }
      for (const token of ["--info"]) {
        expect(hue(palette.get(token) ?? ""), token).toBeGreaterThanOrEqual(190);
        expect(hue(palette.get(token) ?? ""), token).toBeLessThanOrEqual(240);
      }
      for (const token of ["--destructive", "--clay", "--terracotta", "--error-text"]) {
        const tokenHue = hue(palette.get(token) ?? "");
        expect(
          tokenHue <= 20 || tokenHue >= 340,
          `${token} fora do vermelho/terracota`,
        ).toBe(true);
      }
    }
  });

  it("troca o verde do azulejo e do glifo de canto pelo rosa", () => {
    expect(css).toContain('[data-palette="rosa"] .azulejo');
    expect(css).toContain('[data-palette="rosa"] .deco-surface::before');
    expect(css).toContain('[data-palette="rosa"] .card-glyph::after');
    expect(css).toContain("%23edc4d2");
  });
});
