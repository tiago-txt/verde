export type BankIconShape = "rounded" | "circle" | "diamond";

export type BankIconDefinition = {
  id: string;
  name: string;
  keywords: string[];
  brandColor: string;
  inkColor: string;
  initials: string;
  shape: BankIconShape;
};

export const BANK_ICONS: BankIconDefinition[] = [
  {
    id: "bank:bb",
    name: "Banco do Brasil",
    keywords: ["bb", "banco do brasil", "brasil"],
    brandColor: "#003399",
    inkColor: "#ffffff",
    initials: "BB",
    shape: "rounded",
  },
  {
    id: "bank:caixa",
    name: "Caixa",
    keywords: ["cef", "caixa economica federal", "caixa"],
    brandColor: "#0067AB",
    inkColor: "#ffffff",
    initials: "CX",
    shape: "rounded",
  },
  {
    id: "bank:itau",
    name: "Itaú",
    keywords: ["itau", "itaú"],
    brandColor: "#EC7000",
    inkColor: "#ffffff",
    initials: "IT",
    shape: "rounded",
  },
  {
    id: "bank:bradesco",
    name: "Bradesco",
    keywords: ["bradesco", "brad"],
    brandColor: "#CC092F",
    inkColor: "#ffffff",
    initials: "BR",
    shape: "rounded",
  },
  {
    id: "bank:santander",
    name: "Santander",
    keywords: ["santander", "santa"],
    brandColor: "#EC0000",
    inkColor: "#ffffff",
    initials: "ST",
    shape: "rounded",
  },
  {
    id: "bank:nubank",
    name: "Nubank",
    keywords: ["nu", "nubank", "roxo"],
    brandColor: "#820AD1",
    inkColor: "#ffffff",
    initials: "NU",
    shape: "circle",
  },
  {
    id: "bank:inter",
    name: "Inter",
    keywords: ["inter", "banco inter"],
    brandColor: "#FF7A00",
    inkColor: "#ffffff",
    initials: "IN",
    shape: "rounded",
  },
  {
    id: "bank:c6",
    name: "C6 Bank",
    keywords: ["c6", "c6 bank"],
    brandColor: "#242424",
    inkColor: "#ffffff",
    initials: "C6",
    shape: "rounded",
  },
  {
    id: "bank:btg",
    name: "BTG Pactual",
    keywords: ["btg", "btg pactual"],
    brandColor: "#001E62",
    inkColor: "#ffffff",
    initials: "BTG",
    shape: "rounded",
  },
  {
    id: "bank:xp",
    name: "XP",
    keywords: ["xp", "xp investimentos"],
    brandColor: "#111111",
    inkColor: "#ffffff",
    initials: "XP",
    shape: "diamond",
  },
  {
    id: "bank:sicredi",
    name: "Sicredi",
    keywords: ["sicredi", "sic"],
    brandColor: "#3C8C3C",
    inkColor: "#ffffff",
    initials: "SI",
    shape: "rounded",
  },
  {
    id: "bank:sicoob",
    name: "Sicoob",
    keywords: ["sicoob", "sico"],
    brandColor: "#003641",
    inkColor: "#ffffff",
    initials: "SC",
    shape: "rounded",
  },
  {
    id: "bank:pagbank",
    name: "PagBank",
    keywords: ["pagbank", "pagseguro", "pag"],
    brandColor: "#00A868",
    inkColor: "#ffffff",
    initials: "PG",
    shape: "rounded",
  },
  {
    id: "bank:mercadopago",
    name: "Mercado Pago",
    keywords: ["mercado pago", "mercadopago", "mp"],
    brandColor: "#FFE600",
    inkColor: "#1F2937",
    initials: "MP",
    shape: "rounded",
  },
  {
    id: "bank:picpay",
    name: "PicPay",
    keywords: ["picpay", "pic"],
    brandColor: "#21C25E",
    inkColor: "#ffffff",
    initials: "PP",
    shape: "rounded",
  },
  {
    id: "bank:neon",
    name: "Neon",
    keywords: ["neon"],
    brandColor: "#00AEEF",
    inkColor: "#ffffff",
    initials: "NE",
    shape: "rounded",
  },
  {
    id: "bank:banrisul",
    name: "Banrisul",
    keywords: ["banrisul", "banri"],
    brandColor: "#00549F",
    inkColor: "#ffffff",
    initials: "BN",
    shape: "rounded",
  },
];

export const BANK_ICON_IDS = BANK_ICONS.map((bank) => bank.id);

export function isBankIconId(value: string | null | undefined): boolean {
  return Boolean(value && BANK_ICON_IDS.includes(value));
}

export function findBankIcon(
  value: string | null | undefined,
): BankIconDefinition | null {
  if (!value) return null;
  return BANK_ICONS.find((bank) => bank.id === value) ?? null;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filterBankIcons(query: string): BankIconDefinition[] {
  const term = normalize(query);
  if (!term) return BANK_ICONS;
  return BANK_ICONS.filter((bank) => {
    if (normalize(bank.name).includes(term)) return true;
    if (normalize(bank.id).includes(term)) return true;
    return bank.keywords.some((keyword) => normalize(keyword).includes(term));
  });
}
