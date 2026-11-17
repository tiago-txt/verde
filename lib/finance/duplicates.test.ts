import { describe, expect, it } from "vitest";
import { duplicateKey, groupDuplicates, groupRepeated } from "./duplicates";

const base = {
  tipo: "despesa",
  data: "2026-11-10",
  valor: 1_000,
  descricao: "Café",
  contaId: "conta-1",
  cartaoId: null,
  contaDestinoId: null,
  faturaChave: null,
};

describe("duplicidade de lançamentos", () => {
  it("agrupa mesmo tipo, data, valor, descrição e origem", () => {
    const groups = groupDuplicates([
      { ...base, id: "a" },
      { ...base, id: "b" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("não agrupa valores, datas ou origens diferentes", () => {
    const groups = groupDuplicates([
      { ...base, id: "a" },
      { ...base, id: "b", valor: 2_000 },
      { ...base, id: "c", data: "2026-11-11" },
      { ...base, id: "d", contaId: "conta-2" },
    ]);
    expect(groups).toHaveLength(0);
  });

  it("ignora diferenças de caixa e espaços na descrição", () => {
    const groups = groupDuplicates([
      { ...base, id: "a", descricao: "  Café  " },
      { ...base, id: "b", descricao: "CAFÉ" },
    ]);
    expect(groups).toHaveLength(1);
  });

  it("diferencia transferências pelo destino e faturas pela chave", () => {
    const transfer = {
      ...base,
      tipo: "transferencia",
      contaId: "a",
      contaDestinoId: "b",
    };
    const groups = groupDuplicates([
      { ...transfer, id: "1" },
      { ...transfer, id: "2" },
      { ...transfer, id: "3", contaDestinoId: "c" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);

    expect(
      duplicateKey({ ...base, faturaChave: "2026-11" }),
    ).not.toBe(duplicateKey({ ...base, faturaChave: "2026-12" }));
  });
});

describe("possíveis repetições sem vínculo", () => {
  it("agrupa a mesma descrição e origem em datas diferentes", () => {
    const groups = groupRepeated([
      {
        ...base,
        id: "a",
        data: "2026-01-17",
        recorrenciaId: null,
        parcelaGrupoId: null,
      },
      {
        ...base,
        id: "b",
        data: "2026-02-17",
        recorrenciaId: null,
        parcelaGrupoId: null,
      },
      {
        ...base,
        id: "c",
        data: "2026-03-17",
        recorrenciaId: "rec",
        parcelaGrupoId: null,
      },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("ignora o mesmo dia, origens diferentes e ids já agrupados", () => {
    const sameDay = [
      {
        ...base,
        id: "a",
        recorrenciaId: null,
        parcelaGrupoId: null,
      },
      {
        ...base,
        id: "b",
        recorrenciaId: null,
        parcelaGrupoId: null,
      },
    ];
    expect(groupRepeated(sameDay)).toHaveLength(0);

    expect(
      groupRepeated([
        {
          ...base,
          id: "a",
          data: "2026-01-17",
          recorrenciaId: null,
          parcelaGrupoId: null,
        },
        {
          ...base,
          id: "b",
          data: "2026-02-17",
          contaId: "conta-2",
          recorrenciaId: null,
          parcelaGrupoId: null,
        },
      ]),
    ).toHaveLength(0);

    expect(
      groupRepeated(
        [
          {
            ...base,
            id: "a",
            data: "2026-01-17",
            recorrenciaId: null,
            parcelaGrupoId: null,
          },
          {
            ...base,
            id: "b",
            data: "2026-02-17",
            recorrenciaId: null,
            parcelaGrupoId: null,
          },
        ],
        new Set(["a", "b"]),
      ),
    ).toHaveLength(0);
  });
});
