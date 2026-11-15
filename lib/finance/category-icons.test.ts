import { describe, expect, it } from "vitest";
import { suggestCategoryIcon } from "./category-icons";

describe("ícone sugerido para categorias importadas", () => {
  it("mapeia categorias comuns do dia a dia", () => {
    expect(suggestCategoryIcon("Alimentação", "despesa")).toBe("Utensils");
    expect(suggestCategoryIcon("Mercado", "despesa")).toBe("ShoppingCart");
    expect(suggestCategoryIcon("Compras", "despesa")).toBe("ShoppingCart");
    expect(suggestCategoryIcon("Veiculos", "despesa")).toBe("Car");
    expect(suggestCategoryIcon("Combustível", "despesa")).toBe("Fuel");
    expect(suggestCategoryIcon("Saúde", "despesa")).toBe("HeartPulse");
    expect(suggestCategoryIcon("Assinaturas e serviços", "despesa")).toBe("Tv");
    expect(suggestCategoryIcon("Lazer e hobbies", "despesa")).toBe("Gamepad2");
    expect(suggestCategoryIcon("Roupas", "despesa")).toBe("Shirt");
    expect(suggestCategoryIcon("Presentes e doações", "despesa")).toBe("Gift");
    expect(suggestCategoryIcon("Trabalho", "receita")).toBe("Briefcase");
    expect(suggestCategoryIcon("Salário", "receita")).toBe("Wallet");
    expect(suggestCategoryIcon("Investimentos", "despesa")).toBe("TrendingUp");
  });

  it("usa o padrão quando não identifica", () => {
    expect(suggestCategoryIcon("Mãe", "despesa")).toBe("CircleEllipsis");
    expect(suggestCategoryIcon("Outros", "despesa")).toBe("CircleEllipsis");
    expect(suggestCategoryIcon("Outras receitas", "receita")).not.toBe(
      "CircleEllipsis",
    );
  });
});
