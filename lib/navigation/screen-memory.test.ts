import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stableScreen } from "./last-screen";
import {
  rememberedHref,
  rememberedScreenHref,
  rememberScreen,
  withScreenMemory,
} from "./screen-memory";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("memória de tela por seção", () => {
  it("guarda a última busca estável da seção", () => {
    let memory = withScreenMemory(
      {},
      stableScreen("/lancamentos", "mes=2028-12&dias=31"),
      1,
    );
    expect(rememberedScreenHref(memory, "/lancamentos")).toBe(
      "/lancamentos?mes=2028-12&dias=31",
    );

    memory = withScreenMemory(
      memory,
      stableScreen("/lancamentos", "mes=2029-01"),
      2,
    );
    expect(rememberedScreenHref(memory, "/lancamentos")).toBe(
      "/lancamentos?mes=2029-01",
    );
    expect(rememberedScreenHref(memory, "/relatorios")).toBeNull();
  });

  it("não guarda parâmetros transitórios", () => {
    const memory = withScreenMemory(
      {},
      stableScreen(
        "/lancamentos",
        "mes=2028-12&editar=x&abrirFatura=y&faturaChave=2028-12",
      ),
      1,
    );
    expect(rememberedScreenHref(memory, "/lancamentos")).toBe(
      "/lancamentos?mes=2028-12",
    );
  });

  it("mantém no máximo 24 seções", () => {
    let memory = {};
    for (let index = 0; index < 30; index += 1) {
      memory = withScreenMemory(
        memory,
        { path: `/p${index}`, search: "" },
        index,
      );
    }
    expect(Object.keys(memory)).toHaveLength(24);
    expect(rememberedScreenHref(memory, "/p0")).toBeNull();
    expect(rememberedScreenHref(memory, "/p29")).toBe("/p29");
  });
});

describe("memória de tela na sessão", () => {
  beforeEach(() => {
    const storage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lembra por usuário e ignora tela de autenticação", () => {
    rememberScreen("u1", "/lancamentos", "mes=2028-12");
    expect(rememberedHref("u1", "/lancamentos")).toBe(
      "/lancamentos?mes=2028-12",
    );
    expect(rememberedHref("u2", "/lancamentos")).toBeNull();
  });
});
