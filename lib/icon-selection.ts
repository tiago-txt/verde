import { isBankIconId } from "@/lib/finance/bank-icons";
import { isIconName, type IconName } from "@/lib/icon-names";

/** Mantém ícones genéricos antigos e identificadores `bank:*` válidos. */
export function resolveEntityIcon(
  value: string | null | undefined,
  fallback: IconName,
): string {
  if (value && (isIconName(value) || isBankIconId(value))) return value;
  return fallback;
}
