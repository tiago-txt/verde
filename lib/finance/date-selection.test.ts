import { describe, expect, it } from "vitest";
import {
  cancelDateSelection,
  confirmDateSelection,
  openDateSelection,
  selectDate,
} from "./date-selection";

describe("seleção de data com Cancelar/OK", () => {
  it("abre no valor atual", () => {
    expect(openDateSelection("2026-11-20", "2026-11-11").draft).toBe(
      "2026-11-20",
    );
  });

  it("abre em hoje quando não há valor", () => {
    const selection = openDateSelection(null, "2026-11-11");
    expect(selection.draft).toBe("2026-11-11");
    expect(selection.original).toBe("");
  });

  it("selecionar altera só o rascunho", () => {
    const selection = openDateSelection("2026-11-20", "2026-11-11");
    const next = selectDate(selection, "2026-11-25");
    expect(next.draft).toBe("2026-11-25");
    expect(next.original).toBe("2026-11-20");
  });

  it("OK aplica o rascunho", () => {
    const selection = selectDate(
      openDateSelection("2026-11-20", "2026-11-11"),
      "2026-11-25",
    );
    expect(confirmDateSelection(selection)).toBe("2026-11-25");
  });

  it("Cancelar mantém o valor original", () => {
    const selection = selectDate(
      openDateSelection("2026-11-20", "2026-11-11"),
      "2026-11-25",
    );
    expect(cancelDateSelection(selection)).toBe("2026-11-20");
  });

  it("Cancelar sem valor original mantém vazio", () => {
    const selection = selectDate(
      openDateSelection(null, "2026-11-11"),
      "2026-11-25",
    );
    expect(cancelDateSelection(selection)).toBe("");
  });
});
