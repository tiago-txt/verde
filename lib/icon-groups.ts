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
      "FileText",
      "ShieldCheck",
      "TrendingUp",
      "Briefcase",
      "Target",
    ],
  },
  {
    id: "casa",
    label: "Casa e utilidades",
    icons: [
      "House",
      "Building2",
      "KeyRound",
      "Zap",
      "Droplets",
      "Wifi",
      "Flame",
      "Sofa",
      "Bed",
      "Bath",
      "Hammer",
    ],
  },
  {
    id: "alimentacao",
    label: "Alimentação",
    icons: [
      "Utensils",
      "Coffee",
      "Pizza",
      "Salad",
      "Beer",
      "Wine",
      "Cake",
      "IceCream",
    ],
  },
  {
    id: "transporte",
    label: "Transporte",
    icons: ["Car", "Fuel", "Bus", "Wrench", "Bike", "TrainFront", "Truck"],
  },
  {
    id: "saude",
    label: "Saúde e bem-estar",
    icons: ["HeartPulse", "Pill", "Stethoscope", "Dumbbell", "Heart"],
  },
  {
    id: "educacao",
    label: "Educação",
    icons: ["GraduationCap", "BookOpen", "School", "Laptop", "Monitor"],
  },
  {
    id: "lazer-familia",
    label: "Lazer e família",
    icons: [
      "Gamepad2",
      "Music",
      "Tv",
      "Gift",
      "Baby",
      "Ticket",
      "Clapperboard",
      "PartyPopper",
      "Sparkles",
      "Church",
    ],
  },
  {
    id: "compras",
    label: "Compras e estilo",
    icons: [
      "ShoppingCart",
      "ShoppingBag",
      "Store",
      "Shirt",
      "Smartphone",
      "Scissors",
    ],
  },
  {
    id: "viagem",
    label: "Viagem",
    icons: ["Plane", "Hotel", "MapPin"],
  },
  {
    id: "pets",
    label: "Pets",
    icons: ["PawPrint", "Dog", "Cat"],
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
