import type { IconName } from "./icon-names";

export type IconGroup = {
  id: string;
  label: string;
  icons: readonly IconName[];
};

/**
 * Agrupamento semântico dos ícones usados por categorias e orçamentos.
 * A ordem dos grupos segue o uso mais comum no dia a dia financeiro.
 */
export const ICON_GROUPS: readonly IconGroup[] = [
  {
    id: "dinheiro",
    label: "Dinheiro e trabalho",
    icons: [
      "Wallet",
      "Landmark",
      "PiggyBank",
      "Banknote",
      "CreditCard",
      "HandCoins",
      "Receipt",
      "TrendingUp",
      "Briefcase",
      "Target",
    ],
  },
  {
    id: "casa",
    label: "Casa e utilidades",
    icons: ["House", "Building2", "KeyRound", "Zap", "Droplets", "Wifi", "Flame"],
  },
  {
    id: "alimentacao",
    label: "Alimentação",
    icons: ["Utensils", "Coffee"],
  },
  {
    id: "transporte",
    label: "Transporte",
    icons: ["Car", "Fuel", "Bus", "Plane", "Wrench"],
  },
  {
    id: "saude",
    label: "Saúde e bem-estar",
    icons: ["HeartPulse", "Pill", "Stethoscope", "Dumbbell"],
  },
  {
    id: "educacao-lazer",
    label: "Educação e lazer",
    icons: [
      "GraduationCap",
      "BookOpen",
      "Gamepad2",
      "Music",
      "Tv",
      "Gift",
      "PawPrint",
      "Baby",
    ],
  },
  {
    id: "compras",
    label: "Compras e estilo",
    icons: ["ShoppingCart", "Shirt", "Smartphone"],
  },
  {
    id: "outros",
    label: "Outros",
    icons: ["CircleEllipsis", "CirclePlus"],
  },
];

/** Ícones sem grupo (não deve haver; coberto por teste). */
export function ungroupedIcons(icons: readonly IconName[]): IconName[] {
  const grouped = new Set(ICON_GROUPS.flatMap((group) => group.icons));
  return icons.filter((icon) => !grouped.has(icon));
}
