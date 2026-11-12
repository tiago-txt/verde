import { describe, expect, it } from "vitest";
import { tileSpec } from "@/lib/design/tile-spec";
import { getIcon } from "@/lib/icons";
import { filledSegments } from "@/lib/design/progress";
import { countLabel } from "@/lib/design/plural";

describe("resolvedor único de pastilhas", () => {
  it("devolve a mesma cor, ícone e motivo para a mesma entidade", () => {
    const entity = {
      id: "conta-1",
      nome: "Santander",
      cor: "#123456",
      icone: "Wallet",
    };
    const a = tileSpec("conta", entity);
    const b = tileSpec("conta", entity);
    expect(a.color).toBe(b.color);
    expect(a.icon).toBe(b.icon);
    expect(a.motif).toBe(b.motif);
    expect(a.variant).toBe("gold");
  });

  it("orçamento sem cor usa âmbar e ícone alvo", () => {
    const spec = tileSpec("orcamento", { id: "b1", nome: "Mercado" });
    expect(spec.color).toBe("hsl(var(--amber))");
    expect(spec.icon).toBe(getIcon("Target"));
    expect(spec.motif).toBe(3);
    expect(spec.variant).toBe("target");
  });

  it("conta e cartão geram pastilhas com variações próprias", () => {
    const conta = tileSpec("conta", {
      id: "a1",
      cor: "#34d399",
      icone: "Wallet",
    });
    const cartao = tileSpec("cartao", {
      id: "c1",
      cor: "#818cf8",
      icone: "CreditCard",
    });
    expect(conta.variant).toBe("gold");
    expect(cartao.variant).toBe("band");
    expect(cartao.motif).toBe(7);
    expect(conta.color).toBe("#34d399");
    expect(cartao.color).toBe("#818cf8");
  });

  it("mantém motivo fixo de transferência e fatura", () => {
    expect(tileSpec("transferencia").motif).toBe(2);
    expect(tileSpec("fatura", { id: "c1" }).motif).toBe(7);
  });
});

describe("peças e plural", () => {
  it("1% acende pelo menos um segmento", () => {
    expect(filledSegments(0)).toBe(0);
    expect(filledSegments(1)).toBe(1);
    expect(filledSegments(100)).toBe(12);
    expect(filledSegments(0.4)).toBe(1);
  });

  it("plural não usa (s)", () => {
    expect(countLabel(0, "lançamento", "lançamentos")).toBe("0 lançamentos");
    expect(countLabel(1, "orçamento", "orçamentos")).toBe("1 orçamento");
    expect(countLabel(2, "fatura", "faturas")).toBe("2 faturas");
  });
});
