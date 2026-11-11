import { describe, expect, it } from "vitest";
import { dayLabel, groupTransactionsByDay } from "./day-labels";

describe("rótulos de dia", () => {
  const today = "2026-11-10";

  it("usa Hoje, Ontem e Amanhã", () => {
    expect(dayLabel("2026-11-10", today)).toBe("Hoje");
    expect(dayLabel("2026-11-09", today)).toBe("Ontem");
    expect(dayLabel("2026-11-11", today)).toBe("Amanhã");
  });

  it("formata data por extenso em pt-BR", () => {
    expect(dayLabel("2026-11-07", today)).toBe("Sáb, 7 de novembro");
    expect(dayLabel("2026-12-01", today)).toBe("Ter, 1 de dezembro");
  });
});

describe("agrupamento por dia", () => {
  it("agrupa e ordena por data", () => {
    const groups = groupTransactionsByDay([
      { id: "b", data: "2026-11-10" },
      { id: "a", data: "2026-11-09" },
      { id: "c", data: "2026-11-10" },
    ]);

    expect(groups.map((group) => group.day)).toEqual([
      "2026-11-09",
      "2026-11-10",
    ]);
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["b", "c"]);
  });
});
