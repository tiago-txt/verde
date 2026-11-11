import { describe, expect, it } from "vitest";
import {
  assertImportSize,
  detectDelimiter,
  importDuplicateKey,
  mapImportRows,
  parseCsv,
  parseImportDate,
  parseImportType,
  parseImportValue,
} from "./csv-import";

const mapping = {
  data: "Data",
  descricao: "Descrição",
  valor: "Valor",
  tipo: "Tipo",
  conta: "Conta",
  categoria: "Categoria",
};

describe("parsing de CSV", () => {
  it("detecta delimitador e respeita aspas e ponto e vírgula", () => {
    expect(detectDelimiter("Data;Valor\n01/11/2026;10,00")).toBe(";");
    expect(detectDelimiter("Data,Valor\n2026-11-01,10.00")).toBe(",");

    const table = parseCsv(
      '\uFEFFData;Descrição;Valor;Tipo;Conta;Categoria\r\n15/11/2026;"Mercado; central";10,00;despesa;Conta;Mercado',
    );
    expect(table.headers).toEqual([
      "Data",
      "Descrição",
      "Valor",
      "Tipo",
      "Conta",
      "Categoria",
    ]);
    expect(table.rows[0]?.[1]).toBe("Mercado; central");
  });

  it("lê datas ISO/BR e valores BR", () => {
    expect(parseImportDate("15/11/2026")).toBe("2026-11-15");
    expect(parseImportDate("2026-11-15")).toBe("2026-11-15");
    expect(parseImportDate("31/02/2026")).toBeNull();
    expect(parseImportValue("1.234,56")).toBe(123456);
    expect(parseImportValue("1234.56")).toBe(123456);
    expect(parseImportValue("R$ 10,00")).toBe(1000);
    expect(parseImportValue("0,00")).toBeNull();
  });

  it("normaliza tipo", () => {
    expect(parseImportType("Despesa")).toBe("despesa");
    expect(parseImportType("entrada")).toBe("receita");
    expect(parseImportType("transferencia")).toBeNull();
  });

  it("mapeia linhas válidas e inválidas com motivo e linha", () => {
    const result = mapImportRows(
      "Data;Descrição;Valor;Tipo;Conta;Categoria\n15/11/2026;Mercado;10,00;despesa;Conta;Mercado\n31/02/2026;;0;foo;;",
      mapping,
    );
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({
      line: 2,
      data: "2026-11-15",
      valor: 1000,
      tipo: "despesa",
      pago: true,
    });
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.line).toBe(3);
    expect(result.invalid[0]?.message).toContain("data inválida");
  });

  it("acusa colunas obrigatórias ausentes", () => {
    const result = mapImportRows("Data;Valor\n15/11/2026;10,00", mapping);
    expect(result.invalid[0]?.message).toContain("Colunas obrigatórias");
  });

  it("cria chave de duplicado estável", () => {
    expect(
      importDuplicateKey({
        data: "2026-11-15",
        valor: 1000,
        descricao: " Mercado ",
        contaNome: "Conta",
      }),
    ).toBe("2026-11-15|1000|mercado|conta");
  });

  it("valida limite de tamanho", () => {
    expect(assertImportSize("a".repeat(10))).toBeNull();
    expect(assertImportSize("a".repeat(5 * 1024 * 1024 + 1))).toContain(
      "limite",
    );
  });
});
