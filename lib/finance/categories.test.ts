import { describe, expect, it } from "vitest";
import {
  canArchiveCategory,
  canDeleteCategory,
  canMoveCategoryToParent,
  isSystemCategory,
  resolveCategoryId,
  shouldBackfillCategory,
} from "./categories";

const system = {
  despesa: "11111111-1111-4111-8111-111111111111",
  receita: "22222222-2222-4222-8222-222222222222",
};

describe("resolução da categoria final", () => {
  it("mantém a categoria informada", () => {
    expect(
      resolveCategoryId(
        { tipo: "despesa", categoriaId: "categoria-x" },
        system,
      ),
    ).toBe("categoria-x");
  });

  it("usa Outros de despesa quando vazia", () => {
    expect(
      resolveCategoryId({ tipo: "despesa", categoriaId: null }, system),
    ).toBe(system.despesa);
  });

  it("usa Outros de receita quando vazia", () => {
    expect(
      resolveCategoryId({ tipo: "receita", categoriaId: null }, system),
    ).toBe(system.receita);
  });

  it("transferência permanece sem categoria", () => {
    expect(
      resolveCategoryId(
        { tipo: "transferencia", categoriaId: "categoria-x" },
        system,
      ),
    ).toBeNull();
    expect(
      resolveCategoryId({ tipo: "transferencia", categoriaId: null }, system),
    ).toBeNull();
  });
});

describe("backfill de categorias nulas", () => {
  it("indica despesa/receita sem categoria", () => {
    expect(
      shouldBackfillCategory({ tipo: "despesa", categoriaId: null }),
    ).toBe(true);
    expect(
      shouldBackfillCategory({ tipo: "receita", categoriaId: null }),
    ).toBe(true);
  });

  it("não indica transferência nem categoria existente", () => {
    expect(
      shouldBackfillCategory({ tipo: "transferencia", categoriaId: null }),
    ).toBe(false);
    expect(
      shouldBackfillCategory({ tipo: "despesa", categoriaId: "categoria-x" }),
    ).toBe(false);
  });
});

describe("proteção das categorias de sistema", () => {
  const systemCategory = {
    isSystem: true,
    categoriaPaiId: null,
  };
  const normalCategory = {
    isSystem: false,
    categoriaPaiId: null,
  };

  it("identifica sistema", () => {
    expect(isSystemCategory(systemCategory)).toBe(true);
    expect(isSystemCategory(normalCategory)).toBe(false);
  });

  it("bloqueia excluir/arquivar sistema", () => {
    expect(canDeleteCategory(systemCategory)).toBe(false);
    expect(canArchiveCategory(systemCategory)).toBe(false);
    expect(canDeleteCategory(normalCategory)).toBe(true);
    expect(canArchiveCategory(normalCategory)).toBe(true);
  });

  it("bloqueia mover sistema para outra categoria pai", () => {
    expect(canMoveCategoryToParent(systemCategory, null)).toBe(true);
    expect(canMoveCategoryToParent(systemCategory, "outra")).toBe(false);
    expect(canMoveCategoryToParent(normalCategory, "outra")).toBe(true);
  });
});
