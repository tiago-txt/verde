import { describe, expect, it } from "vitest";
import { applyKeypadKey, KEYPAD_MAX_DIGITS, keypadDisplay } from "./numeric-keypad";

describe("teclado numérico em centavos", () => {
  it("digita dígitos e 00 deslocando em centavos", () => {
    expect(applyKeypadKey(0, "1")).toBe(1);
    expect(applyKeypadKey(1, "2")).toBe(12);
    expect(applyKeypadKey(12, "00")).toBe(1200);
    expect(keypadDisplay(1200)).toBe("12,00");
  });

  it("apaga o último dígito", () => {
    expect(applyKeypadKey(1234, "backspace")).toBe(123);
    expect(applyKeypadKey(1, "backspace")).toBe(0);
  });

  it("respeita o limite de dígitos", () => {
    let value = 0;
    for (let index = 0; index < 15; index += 1) {
      value = applyKeypadKey(value, "9");
    }
    expect(String(value)).toHaveLength(KEYPAD_MAX_DIGITS);
  });

  it("ignora teclas inválidas e limpa", () => {
    expect(applyKeypadKey(500, "x")).toBe(500);
    expect(applyKeypadKey(500, "clear")).toBe(0);
  });
});
