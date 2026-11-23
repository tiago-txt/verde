/** Paletas de cor da interface. O "verde" é a paleta original do app. */
export type PaletteId = "verde" | "rosa";

export const DEFAULT_PALETTE: PaletteId = "verde";

/** Chave no localStorage; o logout limpa tudo que começa com "verde". */
export const PALETTE_STORAGE_KEY = "verde-palette";

export const PALETTE_OPTIONS: { id: PaletteId; label: string }[] = [
  { id: "verde", label: "Verde" },
  { id: "rosa", label: "Rosa pastel" },
];

/** Valor salvo desconhecido (ou ausente) volta para a paleta original. */
export function parsePalette(value: string | null | undefined): PaletteId {
  return value === "rosa" ? "rosa" : DEFAULT_PALETTE;
}
