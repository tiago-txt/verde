import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  rememberBudgetDetailScroll,
  takeBudgetDetailScroll,
} from "./scroll-return";

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

describe("posição da lista de orçamentos", () => {
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("window", { sessionStorage: storage });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("guarda e consome a posição uma única vez", () => {
    rememberBudgetDetailScroll(1234.4);
    expect(takeBudgetDetailScroll()).toBe(1234);
    expect(takeBudgetDetailScroll()).toBeNull();
  });

  it("ignora valor inválido e limpa a entrada", () => {
    storage.setItem("verde:budget-detail-scroll", "abc");
    expect(takeBudgetDetailScroll()).toBeNull();
    expect(storage.getItem("verde:budget-detail-scroll")).toBeNull();
  });
});
