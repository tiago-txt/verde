import { describe, expect, it } from "vitest";
import { isSourceVisible } from "./source-visibility";

describe("fontes do lançamento (conta/cartão)", () => {
  it("oculta fontes arquivadas", () => {
    expect(isSourceVisible(true, "cartao:c1", "")).toBe(false);
    expect(isSourceVisible(true, "conta:a1", "conta:a2")).toBe(false);
    expect(isSourceVisible(false, "conta:a1", "")).toBe(true);
  });

  it("mantém a fonte arquivada quando é a seleção atual", () => {
    expect(isSourceVisible(true, "cartao:c1", "cartao:c1")).toBe(true);
    expect(isSourceVisible(true, "conta:a1", "conta:a1")).toBe(true);
  });
});
