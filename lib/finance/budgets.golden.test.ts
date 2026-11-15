// Congela o comportamento aprovado pelo dono; não editar para passar.
import { describe, expect, it } from "vitest";
import {
  aplicarEventosAoResumo,
  calcularCiclo,
  eventosDoCiclo,
  type BudgetCycleConfig,
} from "./budgets";
import type { MonthSummary } from "./summary";

const OPEN_SUMMARY: MonthSummary = {
  entradasPagas: 0,
  saidasPagas: 0,
  entradasPrevistas: 0,
  saidasPrevistas: 0,
  saldoRealizado: 0,
  saldoPrevisto: 0,
};

const BASE: BudgetCycleConfig = {
  valorPadrao: 100_000,
  diaFechamento: 10,
  antecedenciaCiclos: 0,
  dataInicio: "2026-01",
  dataFim: null,
  arquivado: false,
  origens: "todas",
  sobraPolicy: "liberar",
};

describe("provisão e sobra do orçamento", () => {
  it("reserva o restante no início do ciclo e libera no fechamento", () => {
    const ciclo = calcularCiclo(BASE, "2026-11", 30_000);
    expect(ciclo).toMatchObject({
      ciclo: "2026-11",
      inicio: "2026-11-10",
      fim: "2026-12-09",
      fechamento: "2026-12-10",
      limite: 100_000,
      gasto: 30_000,
      restante: 70_000,
      estouro: 0,
      percentual: 30,
    });

    const eventos = eventosDoCiclo(BASE, "2026-11", 30_000);
    expect(eventos).toEqual([
      { tipo: "provisao", data: "2026-11-10", valor: 70_000, ciclo: "2026-11" },
      { tipo: "sobra", data: "2026-12-10", valor: 70_000, ciclo: "2026-11" },
    ]);
  });

  it("mantém a linha no consumo exato e no estouro, com reserva zero", () => {
    const exato = calcularCiclo(BASE, "2026-11", 100_000);
    expect(exato.restante).toBe(0);
    expect(exato.estouro).toBe(0);
    expect(eventosDoCiclo(BASE, "2026-11", 100_000)).toEqual([
      { tipo: "provisao", data: "2026-11-10", valor: 0, ciclo: "2026-11" },
    ]);

    const estouro = calcularCiclo(BASE, "2026-11", 120_000);
    expect(estouro.restante).toBe(0);
    expect(estouro.estouro).toBe(20_000);
    expect(estouro.percentual).toBe(120);
    expect(eventosDoCiclo(BASE, "2026-11", 120_000)).toEqual([
      { tipo: "provisao", data: "2026-11-10", valor: 0, ciclo: "2026-11" },
    ]);
  });

  it("antecipa a provisão em um ciclo quando configurado", () => {
    const eventos = eventosDoCiclo(
      { ...BASE, antecedenciaCiclos: 1 },
      "2026-11",
      30_000,
    );
    expect(eventos[0]).toMatchObject({
      tipo: "provisao",
      data: "2026-10-10",
      valor: 70_000,
    });
  });

  it("modo indicador não gera reserva nem liberação", () => {
    expect(
      eventosDoCiclo({ ...BASE, modoIndicador: true }, "2026-11", 30_000),
    ).toEqual([]);
  });

  it("ciclo passado usa as mesmas datas e valores", () => {
    expect(eventosDoCiclo(BASE, "2026-09", 30_000)).toEqual([
      { tipo: "provisao", data: "2026-09-10", valor: 70_000, ciclo: "2026-09" },
      { tipo: "sobra", data: "2026-10-10", valor: 70_000, ciclo: "2026-09" },
    ]);
  });
});

describe("efeito no previsto", () => {
  it("provisão reduz e sobra aumenta o previsto", () => {
    const comProvisao = aplicarEventosAoResumo(OPEN_SUMMARY, [
      { tipo: "provisao", data: "2026-11-10", valor: 70_000, ciclo: "2026-11" },
    ]);
    expect(comProvisao).toMatchObject({
      entradasPrevistas: 0,
      saidasPrevistas: 70_000,
      saldoPrevisto: -70_000,
      provisoesOrcamento: 70_000,
      sobrasOrcamento: 0,
    });

    const comSobra = aplicarEventosAoResumo(OPEN_SUMMARY, [
      { tipo: "sobra", data: "2026-12-10", valor: 70_000, ciclo: "2026-11" },
    ]);
    expect(comSobra).toMatchObject({
      entradasPrevistas: 70_000,
      saidasPrevistas: 0,
      saldoPrevisto: 70_000,
      provisoesOrcamento: 0,
      sobrasOrcamento: 70_000,
    });
  });
});
