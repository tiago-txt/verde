import { describe, expect, it } from "vitest";
import { addMonthsClamped, addYearsClamped } from "./date-math";

describe("addMonthsClamped", () => {
  it("mantém o dia 31 e ajusta meses curtos", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-01-31", 3)).toBe("2026-04-30");
  });

  it("respeita ano bissexto", () => {
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("atravessa anos", () => {
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsClamped("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("addYearsClamped", () => {
  it("preserva 29/02 somente em anos bissextos", () => {
    expect(addYearsClamped("2024-02-29", 1)).toBe("2025-02-28");
    expect(addYearsClamped("2024-02-29", 4)).toBe("2028-02-29");
  });
});
