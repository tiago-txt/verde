import { describe, expect, it } from "vitest";
import {
  generateRecurrenceDates,
  planRecurrenceOccurrences,
  recurrenceHorizon,
} from "./recurrence";

describe("geração de recorrências", () => {
  it("mensal no dia 31 respeita meses curtos e bissextos", () => {
    expect(
      generateRecurrenceDates({
        frequencia: "mensal",
        dataInicio: "2026-01-31",
        dataFim: "2026-04-30",
      }),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);

    expect(
      generateRecurrenceDates({
        frequencia: "mensal",
        dataInicio: "2024-01-31",
        dataFim: "2024-03-31",
      }),
    ).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });

  it("semanal soma 7 dias", () => {
    expect(
      generateRecurrenceDates({
        frequencia: "semanal",
        dataInicio: "2026-11-02",
        dataFim: "2026-11-16",
      }),
    ).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("anual preserva 29/02 quando possível", () => {
    expect(
      generateRecurrenceDates({
        frequencia: "anual",
        dataInicio: "2024-02-29",
        dataFim: "2028-02-29",
      }),
    ).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("inclui a data final e respeita o limite until", () => {
    expect(
      generateRecurrenceDates({
        frequencia: "mensal",
        dataInicio: "2026-01-10",
        dataFim: "2026-03-10",
      }),
    ).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);

    expect(
      generateRecurrenceDates({
        frequencia: "mensal",
        dataInicio: "2026-01-10",
        dataFim: "2026-12-10",
        until: "2026-02-28",
      }),
    ).toEqual(["2026-01-10", "2026-02-10"]);
  });

  it("retorna vazio quando a data final é anterior ao início", () => {
    expect(
      generateRecurrenceDates({
        frequencia: "mensal",
        dataInicio: "2026-05-10",
        dataFim: "2026-04-10",
      }),
    ).toEqual([]);
  });

  it("planeja somente ocorrências inexistentes (idempotência)", () => {
    const spec = {
      frequencia: "mensal" as const,
      dataInicio: "2026-01-10",
      dataFim: "2026-04-10",
    };
    const firstRun = planRecurrenceOccurrences(spec, []);
    expect(firstRun).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
      "2026-04-10",
    ]);

    const secondRun = planRecurrenceOccurrences(spec, firstRun);
    expect(secondRun).toEqual([]);

    expect(
      planRecurrenceOccurrences(spec, ["2026-02-10"]),
    ).toEqual(["2026-01-10", "2026-03-10", "2026-04-10"]);
  });

  it("calcula horizonte de pelo menos 12 meses à frente", () => {
    expect(recurrenceHorizon("2026-01", "2026-11-10")).toBe("2027-11-30");
    expect(recurrenceHorizon("2028-05", "2026-11-10")).toBe("2028-05-31");
  });
});
