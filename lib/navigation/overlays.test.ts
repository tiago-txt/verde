import { describe, expect, it } from "vitest";
import {
  parseBudgetEventOverlay,
  parseInvoiceOverlay,
  purchaseEditHref,
  withScreenParams,
} from "./overlays";

const CARD_ID = "2d2d65e1-dbe6-4e00-81a6-e793736aa02f";

describe("overlay de fatura em Lançamentos", () => {
  it("aceita cartão e mês válidos", () => {
    expect(parseInvoiceOverlay(CARD_ID, "2026-11")).toEqual({
      cartaoId: CARD_ID,
      faturaChave: "2026-11",
    });
  });

  it("usa o primeiro valor quando o parâmetro se repete", () => {
    expect(parseInvoiceOverlay([CARD_ID, "x"], ["2026-11", "2026-12"])).toEqual({
      cartaoId: CARD_ID,
      faturaChave: "2026-11",
    });
  });

  it("recusa cartão, mês ou combinação inválidos", () => {
    expect(parseInvoiceOverlay(undefined, "2026-11")).toBeNull();
    expect(parseInvoiceOverlay(CARD_ID, undefined)).toBeNull();
    expect(parseInvoiceOverlay("nao-e-uuid", "2026-11")).toBeNull();
    expect(parseInvoiceOverlay(CARD_ID, "2026-13")).toBeNull();
    expect(parseInvoiceOverlay(CARD_ID, "novembro")).toBeNull();
  });
});

describe("overlay de evento de orçamento", () => {
  it("aceita o identificador composto do evento", () => {
    const eventId = `${CARD_ID}:2026-11:provisao`;
    expect(parseBudgetEventOverlay(eventId)).toBe(eventId);
  });

  it("recusa identificadores fora do formato", () => {
    expect(parseBudgetEventOverlay(undefined)).toBeNull();
    expect(parseBudgetEventOverlay("")).toBeNull();
    expect(parseBudgetEventOverlay("evento com espaço")).toBeNull();
    expect(parseBudgetEventOverlay("<script>")).toBeNull();
  });
});

describe("parâmetros de retorno para overlay", () => {
  it("preserva mês e filtros ao abrir a fatura", () => {
    expect(
      withScreenParams("/lancamentos?mes=2026-12&dias=31", {
        abrirFatura: CARD_ID,
        faturaChave: "2026-12",
      }),
    ).toBe(
      `/lancamentos?mes=2026-12&dias=31&abrirFatura=${CARD_ID}&faturaChave=2026-12`,
    );
  });

  it("codifica identificadores com dois-pontos", () => {
    expect(
      withScreenParams("/lancamentos?mes=2026-11", {
        abrirEvento: `${CARD_ID}:2026-11:provisao`,
      }),
    ).toBe(
      `/lancamentos?mes=2026-11&abrirEvento=${CARD_ID}%3A2026-11%3Aprovisao`,
    );
  });

  it("funciona com href sem query", () => {
    expect(
      withScreenParams("/lancamentos", { abrirFatura: CARD_ID }),
    ).toBe(`/lancamentos?abrirFatura=${CARD_ID}`);
  });
});

describe("link de edição da compra", () => {
  it("mantém mês, dias e filtros da tela de origem em Lançamentos", () => {
    const returnTo = `/lancamentos?mes=2026-11&dias=10&abrirFatura=${CARD_ID}&faturaChave=2026-11`;
    const href = purchaseEditHref(returnTo, { id: "tx-1", mes: "2026-10" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("mes")).toBe("2026-11");
    expect(params.get("dias")).toBe("10");
    expect(params.get("editar")).toBe("tx-1");
    expect(params.get("voltar")).toBe(returnTo);
    expect(params.get("abrirFatura")).toBe(CARD_ID);
  });

  it("fora de Lançamentos abre no mês da compra", () => {
    expect(
      purchaseEditHref("/cartoes/c1?fatura=2026-11", {
        id: "tx-1",
        mes: "2026-10",
      }),
    ).toBe(
      "/lancamentos?mes=2026-10&editar=tx-1&dias=31&voltar=%2Fcartoes%2Fc1%3Ffatura%3D2026-11",
    );
  });
});
