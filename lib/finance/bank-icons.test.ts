import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  BANK_ICONS,
  findBankIcon,
  findBankIconByName,
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

  it("identifica banco pelo nome usado na importação", () => {
    expect(findBankIconByName("Nu")?.id).toBe("bank:nubank");
    expect(findBankIconByName("Nubank")?.id).toBe("bank:nubank");
    expect(findBankIconByName("Conta Salário")).toBeNull();
    expect(findBankIconByName("Banco Inter")?.id).toBe("bank:inter");
    expect(findBankIconByName("Cartão Amazon Prime")?.id).toBe(
      "bank:amazonprime",
    );
    expect(findBankIconByName("Cartão Samsung")?.id).toBe("bank:samsung");
    expect(findBankIconByName("Cartão Carbono")?.id).toBe("bank:c6");
    expect(findBankIconByName("Recarga Pay")?.id).toBe("bank:recargapay");
    expect(findBankIconByName("Elite")?.id).toBe("bank:santanderelite");
    expect(findBankIconByName("Meliuz")?.id).toBe("bank:meliuz");
    expect(findBankIconByName("N26")?.id).toBe("bank:n26");
    expect(findBankIconByName("Next")?.id).toBe("bank:next");
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

  it("aponta para SVGs locais existentes", () => {
    const ids = new Set(BANK_ICONS.map((bank) => bank.id));
    const logos = new Set(BANK_ICONS.map((bank) => bank.logo));

    expect(ids.size).toBe(BANK_ICONS.length);
    expect(logos.size).toBe(BANK_ICONS.length);

    for (const bank of BANK_ICONS) {
      expect(bank.logo).toMatch(/^\/banks\/[a-z0-9]+\.svg$/);
      const file = path.join(process.cwd(), "public", bank.logo);
      expect(fs.existsSync(file), `${bank.logo} ausente`).toBe(true);
      expect(fs.readFileSync(file, "utf8")).toContain("<svg");
    }
  });
});
