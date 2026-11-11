export const ICON_NAMES = [
  "Wallet",
  "Landmark",
  "PiggyBank",
  "Banknote",
  "CreditCard",
  "House",
  "Building2",
  "KeyRound",
  "ShoppingCart",
  "Utensils",
  "Car",
  "Fuel",
  "Bus",
  "Wrench",
  "HeartPulse",
  "Pill",
  "Stethoscope",
  "GraduationCap",
  "BookOpen",
  "Gamepad2",
  "Music",
  "Coffee",
  "Shirt",
  "Tv",
  "Smartphone",
  "TrendingUp",
  "Target",
  "Briefcase",
  "Receipt",
  "HandCoins",
  "Plane",
  "Gift",
  "PawPrint",
  "Baby",
  "Dumbbell",
  "Zap",
  "Droplets",
  "Wifi",
  "Flame",
  "CircleEllipsis",
  "CirclePlus",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export function isIconName(value: string): value is IconName {
  return (ICON_NAMES as readonly string[]).includes(value);
}

export function toIconName(
  value: string | null | undefined,
  fallback: IconName = "CircleEllipsis",
): IconName {
  return value && isIconName(value) ? value : fallback;
}
