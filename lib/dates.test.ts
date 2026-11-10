import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  addMonths,
  dateInMonth,
  daysInMonth,
  isValidISODate,
  isValidMonthKey,
  monthRange,
  rangeBetween,
  todayISO,
} from "./dates";

describe("addMonths", () => {
  it("avança e retrocede entre anos", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-11", 0)).toBe("2026-11");
    expect(addMonths("2026-01", 14)).toBe("2027-03");
  });
});

describe("daysInMonth", () => {
  it("respeita anos bissextos", () => {
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});

describe("monthRange", () => {
  it("retorna primeiro e último dia", () => {
    expect(monthRange("2026-02")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });
});

describe("dateInMonth", () => {
  it("limita o dia ao último dia do mês", () => {
    expect(dateInMonth("2026-02", 31)).toBe("2026-02-28");
    expect(dateInMonth("2026-02", 0)).toBe("2026-02-01");
    expect(dateInMonth("2026-11", 15)).toBe("2026-11-15");
  });
});

describe("addDaysISO", () => {
  it("soma dias atravessando meses", () => {
    expect(addDaysISO("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("rangeBetween", () => {
  it("gera intervalo inclusivo", () => {
    expect(rangeBetween("2026-11-01", "2026-11-03")).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
    ]);
  });
});

describe("validadores", () => {
  it("valida datas e meses", () => {
    expect(isValidISODate("2026-11-09")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("09/11/2026")).toBe(false);
    expect(isValidMonthKey("2026-11")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
  });

  it("todayISO está no formato YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
