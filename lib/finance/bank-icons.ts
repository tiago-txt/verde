export type BankIconDefinition = {
  id: string;
  name: string;
  keywords: string[];
  brandColor: string;
  /** Arquivo SVG local servido de `/public/banks`. */
  logo: string;
};

/**
 * Catálogo local de instituições financeiras.
 *
 * Os arquivos em `public/banks` vêm do projeto react-bancos
 * (github.com/henriquezolini/react-bancos) e são marcas registradas de seus
 * respectivos titulares, usadas aqui apenas para identificação da instituição.
 */
export const BANK_ICONS: BankIconDefinition[] = [
  {
    id: "bank:bb",
    name: "Banco do Brasil",
    keywords: ["bb", "banco do brasil", "brasil"],
    brandColor: "#003399",
    logo: "/banks/bancodobrasil.svg",
  },
  {
    id: "bank:caixa",
    name: "Caixa",
    keywords: ["cef", "caixa economica federal", "caixa"],
    brandColor: "#0067AB",
    logo: "/banks/caixa.svg",
  },
  {
    id: "bank:itau",
    name: "Itaú",
    keywords: ["itau", "itaú"],
    brandColor: "#EC7000",
    logo: "/banks/itau.svg",
  },
  {
    id: "bank:bradesco",
    name: "Bradesco",
    keywords: ["bradesco", "brad"],
    brandColor: "#CC092F",
    logo: "/banks/bradesco.svg",
  },
  {
    id: "bank:santander",
    name: "Santander",
    keywords: ["santander", "santa"],
    brandColor: "#EC0000",
    logo: "/banks/santander.svg",
  },
  {
    id: "bank:nubank",
    name: "Nubank",
    keywords: ["nu", "nubank", "roxo"],
    brandColor: "#820AD1",
    logo: "/banks/nubank.svg",
  },
  {
    id: "bank:inter",
    name: "Inter",
    keywords: ["inter", "banco inter"],
    brandColor: "#FF7A00",
    logo: "/banks/inter.svg",
  },
  {
    id: "bank:c6",
    name: "C6 Bank",
    keywords: ["c6", "c6 bank"],
    brandColor: "#242424",
    logo: "/banks/c6bank.svg",
  },
  {
    id: "bank:btg",
    name: "BTG Pactual",
    keywords: ["btg", "btg pactual"],
    brandColor: "#001E62",
    logo: "/banks/btgpactual.svg",
  },
  {
    id: "bank:xp",
    name: "XP",
    keywords: ["xp", "xp investimentos"],
    brandColor: "#111111",
    logo: "/banks/xp.svg",
  },
  {
    id: "bank:sicredi",
    name: "Sicredi",
    keywords: ["sicredi", "sic"],
    brandColor: "#3C8C3C",
    logo: "/banks/sicredi.svg",
  },
  {
    id: "bank:sicoob",
    name: "Sicoob",
    keywords: ["sicoob", "sico"],
    brandColor: "#003641",
    logo: "/banks/sicoob.svg",
  },
  {
    id: "bank:pagbank",
    name: "PagBank",
    keywords: ["pagbank", "pagseguro", "pag"],
    brandColor: "#00A868",
    logo: "/banks/pagbank.svg",
  },
  {
    id: "bank:mercadopago",
    name: "Mercado Pago",
    keywords: ["mercado pago", "mercadopago", "mp"],
    brandColor: "#00BCFF",
    logo: "/banks/mercadopago.svg",
  },
  {
    id: "bank:picpay",
    name: "PicPay",
    keywords: ["picpay", "pic"],
    brandColor: "#21C25E",
    logo: "/banks/picpay.svg",
  },
  {
    id: "bank:neon",
    name: "Neon",
    keywords: ["neon"],
    brandColor: "#00AEEF",
    logo: "/banks/neon.svg",
  },
  {
    id: "bank:banrisul",
    name: "Banrisul",
    keywords: ["banrisul", "banri"],
    brandColor: "#00549F",
    logo: "/banks/banrisul.svg",
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
