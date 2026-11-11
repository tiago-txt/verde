import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  firstDayOfWeek,
  lastDayOfWeek,
} from "./calendar";

describe("grade do calendário", () => {
  it("gera 42 dias começando no domingo", () => {
    const grid = buildMonthGrid("2026-11", "2026-11-10");

    expect(grid).toHaveLength(42);
    expect(new Date(`${grid[0]?.iso}T12:00:00Z`).getUTCDay()).toBe(0);
    expect(grid[0]?.iso).toBe("2026-11-01");
    expect(grid[41]?.iso).toBe("2026-12-12");
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30);
    expect(grid.find((cell) => cell.isToday)?.iso).toBe("2026-11-10");
  });

  it("inclui 29/02 em ano bissexto", () => {
    const grid = buildMonthGrid("2024-02", "2024-02-10");
    expect(grid.some((cell) => cell.iso === "2024-02-29")).toBe(true);
  });

  it("calcula início e fim da semana", () => {
    expect(firstDayOfWeek("2026-11-10")).toBe("2026-11-08");
    expect(lastDayOfWeek("2026-11-10")).toBe("2026-11-14");
  });
});
