import { describe, expect, it } from "vitest";
import {
  canRestoreLastScreen,
  sanitizeReturnTo,
  stableScreen,
} from "./last-screen";

describe("última tela", () => {
  it("remove parâmetros transitórios e preserva mês/filtros", () => {
    expect(
      stableScreen(
        "/lancamentos",
        "mes=2026-11&detalhe=abc&editar=def&novo=1&tipo=despesa&dias=31",
      ),
    ).toEqual({
      path: "/lancamentos",
      search: "?mes=2026-11&tipo=despesa&dias=31",
    });
  });

  it("não guarda overlays, retornos nem edição como última tela", () => {
    expect(
      stableScreen(
        "/limite-de-gastos",
        "ciclo=2026-11&abrirOrcamento=abc&orcamento=def&arquivados=1",
      ),
    ).toEqual({
      path: "/limite-de-gastos",
      search: "?ciclo=2026-11&arquivados=1",
    });

    expect(
      stableScreen(
        "/lancamentos",
        "mes=2026-11&dias=31&abrirFatura=abc&faturaChave=2026-11&voltar=%2Fcartoes%2Fabc",
      ),
    ).toEqual({
      path: "/lancamentos",
      search: "?mes=2026-11&dias=31",
    });

    expect(
      stableScreen(
        "/lancamentos",
        "mes=2026-11&abrirEvento=abc%3A2026-11%3Aprovisao",
      ),
    ).toEqual({
      path: "/lancamentos",
      search: "?mes=2026-11",
    });
  });

  it("mantém telas sem parâmetros", () => {
    expect(stableScreen("/cartoes", "")).toEqual({
      path: "/cartoes",
      search: "",
    });
  });

  it("não restaura telas de autenticação ou offline", () => {
    expect(canRestoreLastScreen("/login")).toBe(false);
    expect(canRestoreLastScreen("/cadastro")).toBe(false);
    expect(canRestoreLastScreen("/trocar-senha")).toBe(false);
    expect(canRestoreLastScreen("/offline")).toBe(false);
    expect(canRestoreLastScreen("/lancamentos")).toBe(true);
    expect(canRestoreLastScreen("/cartoes/123")).toBe(true);
  });
});

describe("retorno para a fatura", () => {
  it("aceita somente caminhos internos", () => {
    expect(sanitizeReturnTo("/cartoes/123?fatura=2026-11")).toBe(
      "/cartoes/123?fatura=2026-11",
    );
    expect(sanitizeReturnTo("  /lancamentos?mes=2026-11  ")).toBe(
      "/lancamentos?mes=2026-11",
    );
    expect(sanitizeReturnTo("https://example.com")).toBeNull();
    expect(sanitizeReturnTo("//example.com")).toBeNull();
    expect(sanitizeReturnTo("/\\example.com")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
  });
});
