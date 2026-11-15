import { describe, expect, it } from "vitest";
import { COLOR_PALETTE } from "./colors";

describe("paleta de cores", () => {
  it("mantém valores e rótulos únicos", () => {
    const values = COLOR_PALETTE.map((color) => color.value.toLowerCase());
    const labels = COLOR_PALETTE.map((color) => color.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("usa apenas cores hexadecimais válidas", () => {
    for (const color of COLOR_PALETTE) {
      expect(color.value).toMatch(/^#[0-9a-f]{6}$/i);
      expect(color.label.trim().length).toBeGreaterThan(0);
    }
  });
});
