export const KEYPAD_MAX_DIGITS = 9;

/**
 * Teclado numérico em centavos: cada dígito desloca o valor para a esquerda.
 * "00" adiciona dois zeros; apagar remove o último dígito.
 */
export function applyKeypadKey(
  cents: number,
  key: string,
  maxDigits = KEYPAD_MAX_DIGITS,
): number {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.trunc(cents)) : 0;
  if (key === "backspace") return Math.floor(safe / 10);
  if (key === "clear") return 0;
  if (!/^\d{1,2}$/.test(key)) return safe;

  const digits = String(safe) === "0" ? "" : String(safe);
  const next = `${digits}${key}`.replace(/^0+(?=\d)/, "");
  const limited = next.slice(0, maxDigits);
  return limited ? Number(limited) : 0;
}

export function keypadDisplay(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2).replace(".", ",");
}
