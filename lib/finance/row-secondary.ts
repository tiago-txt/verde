export const SECONDARY_INFO_OPTIONS = [
  "categoria-conta",
  "categoria",
  "conta",
  "nenhuma",
] as const;

export type SecondaryInfo = (typeof SECONDARY_INFO_OPTIONS)[number];

export const DEFAULT_SECONDARY_INFO: SecondaryInfo = "categoria-conta";

export const SECONDARY_INFO_STORAGE_KEY = "verde-secondary-info";

export const SECONDARY_INFO_LABELS: Record<SecondaryInfo, string> = {
  "categoria-conta": "Categoria · Conta",
  categoria: "Só categoria",
  conta: "Só conta",
  nenhuma: "Nenhuma",
};

/** Valor antigo, quando a linha mostrava conta antes da categoria. */
const LEGACY_OPTIONS: Record<string, SecondaryInfo> = {
  "conta-categoria": "categoria-conta",
};

export function isSecondaryInfo(value: unknown): value is SecondaryInfo {
  return (
    typeof value === "string" &&
    (SECONDARY_INFO_OPTIONS as readonly string[]).includes(value)
  );
}

/** Aceita o valor persistido e migra a ordem antiga sem perder a preferência. */
export function normalizeSecondaryInfo(value: unknown): SecondaryInfo | null {
  if (typeof value === "string" && value in LEGACY_OPTIONS) {
    return LEGACY_OPTIONS[value] ?? null;
  }
  return isSecondaryInfo(value) ? value : null;
}

/** Texto da segunda linha da lista de lançamentos. */
export function secondaryLine(
  option: SecondaryInfo,
  input: {
    categoria?: string | null;
    conta?: string | null;
    transferencia?: boolean;
    origem?: string | null;
    destino?: string | null;
  },
): string {
  if (input.transferencia) {
    return [input.origem, input.destino]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" → ");
  }

  const categoria = input.categoria?.trim() || null;
  const conta = input.conta?.trim() || null;

  if (option === "nenhuma") return "";
  if (option === "categoria") return categoria ?? "";
  if (option === "conta") return conta ?? "";
  return [categoria, conta].filter(Boolean).join(" · ");
}
