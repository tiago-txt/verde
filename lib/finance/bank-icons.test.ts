import { describe, expect, it } from "vitest";
import {
  findBankIcon,
  filterBankIcons,
  isBankIconId,
} from "./bank-icons";
import { tileSpec } from "@/lib/design/tile-spec";
import { bankOrIconNameSchema, iconNameSchema } from "@/lib/validation/common";

describe("catálogo de instituições financeiras", () => {
  it("resolve bank:* de forma consistente em contas e cartões", () => {
    const conta = tileSpec("conta", { icone: "bank:nubank" });
    const cartao = tileSpec("cartao", { icone: "bank:nubank" });

    expect(conta.bank?.name).toBe("Nubank");
    expect(conta.color).toBe("#820AD1");
    expect(conta.variant).toBe("gold");
    expect(cartao.bank?.name).toBe("Nubank");
    expect(cartao.variant).toBe("band");
    expect(tileSpec("conta", { icone: "bank:nubank" }).bank?.id).toBe(
      "bank:nubank",
    );
  });

  it("faz fallback para identificador desconhecido", () => {
    const spec = tileSpec("conta", { icone: "bank:inexistente" });
    expect(spec.bank).toBeNull();
    expect(spec.icon).toBeTruthy();
    expect(spec.color).toBe("hsl(var(--primary))");
  });

  it("filtra por nome e palavras-chave", () => {
    expect(filterBankIcons("nu").map((bank) => bank.id)).toContain("bank:nubank");
    expect(filterBankIcons("bb").map((bank) => bank.id)).toContain("bank:bb");
    expect(filterBankIcons("cef").map((bank) => bank.id)).toContain(
      "bank:caixa",
    );
    expect(filterBankIcons("itau").map((bank) => bank.id)).toContain(
      "bank:itau",
    );
    expect(filterBankIcons("mercado pago").map((bank) => bank.id)).toContain(
      "bank:mercadopago",
    );
  });

  it("mantém ids estáveis e validação compatível", () => {
    expect(findBankIcon("bank:itau")?.brandColor).toBe("#EC7000");
    expect(isBankIconId("bank:santander")).toBe(true);
    expect(isBankIconId("bank:desconhecido")).toBe(false);
    expect(bankOrIconNameSchema.safeParse("bank:nubank").success).toBe(true);
    expect(bankOrIconNameSchema.safeParse("Wallet").success).toBe(true);
    expect(bankOrIconNameSchema.safeParse("bank:desconhecido").success).toBe(
      false,
    );
    expect(iconNameSchema.safeParse("bank:nubank").success).toBe(false);
  });
});
