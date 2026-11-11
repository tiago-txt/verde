import { describe, expect, it } from "vitest";
import {
  idsForBatchDelete,
  idsForCategoryChange,
  idsForPaidChange,
  type BatchTransaction,
} from "./batch";

const items: BatchTransaction[] = [
  { id: "d1", tipo: "despesa", pago: false, categoriaId: null },
  { id: "d2", tipo: "despesa", pago: true, categoriaId: "c1" },
  { id: "r1", tipo: "receita", pago: false, categoriaId: "c2" },
  { id: "t1", tipo: "transferencia", pago: true, categoriaId: null },
];

describe("ações em lote", () => {
  it("seleciona apenas quem muda de status", () => {
    expect(idsForPaidChange(items, true)).toEqual(["d1", "r1"]);
    expect(idsForPaidChange(items, false)).toEqual(["d2", "t1"]);
  });

  it("respeita o tipo ao trocar categoria e ignora transferências", () => {
    expect(idsForCategoryChange(items, "despesa")).toEqual({
      applicable: ["d1", "d2"],
      ignored: ["r1", "t1"],
    });
    expect(idsForCategoryChange(items, "receita")).toEqual({
      applicable: ["r1"],
      ignored: ["d1", "d2", "t1"],
    });
  });

  it("exclusão em lote afeta só os selecionados (não expande série)", () => {
    expect(idsForBatchDelete(items, ["d1", "t1", "inexistente"])).toEqual([
      "d1",
      "t1",
    ]);
  });
});
