import { describe, expect, it } from "vitest";
import {
  analyzeSpreadsheet,
  buildCanonicalRows,
  buildSheetInvoiceTotals,
  classifySpecialRow,
  detectSheetKind,
  findUniqueInvoiceMatch,
  investmentGroupKey,
  normalizeEntityName,
  normalizeHeader,
  parseInstallment,
  parseInvoiceMonth,
  parsePaymentDescription,
  parseSpreadsheetDate,
  parseSpreadsheetValue,
  spreadsheetDuplicateKey,
  type SpreadsheetSheet,
} from "./spreadsheet-import";

describe("datas de planilha", () => {
  it("aceita dd.mm.aaaa, dd/mm/aaaa e ISO", () => {
    expect(parseSpreadsheetDate("04.11.2026")).toBe("2026-11-04");
    expect(parseSpreadsheetDate("4/11/2026")).toBe("2026-11-04");
    expect(parseSpreadsheetDate("2026-11-04")).toBe("2026-11-04");
    expect(parseSpreadsheetDate("2026-11-04T12:00:00Z")).toBe("2026-11-04");
  });

  it("aceita serial do Excel nos modos 1900 e 1904", () => {
    expect(parseSpreadsheetDate(45000)).toBe("2023-03-15");
    expect(parseSpreadsheetDate(0, { date1904: true })).toBe("1904-01-01");
    expect(parseSpreadsheetDate(1, { date1904: true })).toBe("1904-01-02");
  });

  it("rejeita datas inexistentes", () => {
    expect(parseSpreadsheetDate("31.02.2026")).toBeNull();
    expect(parseSpreadsheetDate("31/02/2026")).toBeNull();
    expect(parseSpreadsheetDate("2026-02-30")).toBeNull();
    expect(parseSpreadsheetDate("abc")).toBeNull();
    expect(parseSpreadsheetDate("")).toBeNull();
  });
});

describe("valores de planilha", () => {
  it("converte pt-BR, US, R$ e negativos em centavos", () => {
    expect(parseSpreadsheetValue("1.234,56")).toBe(123456);
    expect(parseSpreadsheetValue(1234.56)).toBe(123456);
    expect(parseSpreadsheetValue("R$ 1.234,56")).toBe(123456);
    expect(parseSpreadsheetValue("-150,00")).toBe(-15000);
    expect(parseSpreadsheetValue("(10,50)")).toBe(-1050);
    expect(parseSpreadsheetValue("0,00")).toBe(0);
  });

  it("rejeita textos sem valor", () => {
    expect(parseSpreadsheetValue("")).toBeNull();
    expect(parseSpreadsheetValue("abc")).toBeNull();
    expect(parseSpreadsheetValue(true)).toBeNull();
  });
});

describe("meses de fatura", () => {
  it("converte todos os meses em português com e sem acento", () => {
    const months = [
      ["Janeiro", "01"],
      ["Fevereiro", "02"],
      ["Março", "03"],
      ["Marco", "03"],
      ["Abril", "04"],
      ["Maio", "05"],
      ["Junho", "06"],
      ["Julho", "07"],
      ["Agosto", "08"],
      ["Setembro", "09"],
      ["Outubro", "10"],
      ["Novembro", "11"],
      ["Dezembro", "12"],
    ];
    for (const [name, month] of months) {
      expect(parseInvoiceMonth(`${name}/2026`)).toBe(`2026-${month}`);
      expect(parseInvoiceMonth(`${name?.toUpperCase()} de 2026`)).toBe(
        `2026-${month}`,
      );
      expect(parseInvoiceMonth(`${name} 2026`)).toBe(`2026-${month}`);
    }
    expect(parseInvoiceMonth("Novembro/2026")).toBe("2026-11");
    expect(parseInvoiceMonth("Inválido/2026")).toBeNull();
  });
});

describe("descrição de pagamento de fatura", () => {
  it("separa cartão e mês", () => {
    expect(
      parsePaymentDescription(
        "Pagamento de fatura - Banco Inter - Agosto de 2022",
      ),
    ).toEqual({
      generic: false,
      cardName: "Banco Inter",
      faturaChave: "2022-08",
    });
    expect(
      parsePaymentDescription("Pagamento de fatura - Nu - Novembro 2026"),
    ).toEqual({
      generic: false,
      cardName: "Nu",
      faturaChave: "2026-11",
    });
  });

  it("reconhece descrição genérica", () => {
    expect(parsePaymentDescription("Pagamento de fatura")).toEqual({
      generic: true,
      cardName: null,
      faturaChave: null,
    });
  });
});

describe("parcelas", () => {
  it("detecta n/total no fim da descrição", () => {
    expect(parseInstallment("Sky Team 4/4")).toMatchObject({
      descricaoBase: "Sky Team",
      parcelaAtual: 4,
      parcelaTotal: 4,
    });
    expect(parseInstallment("Martele 3/6")).toMatchObject({
      descricaoBase: "Martele",
      parcelaAtual: 3,
      parcelaTotal: 6,
    });
    expect(parseInstallment("Lavadora 15kg 7/8")).toMatchObject({
      descricaoBase: "Lavadora 15kg",
      parcelaAtual: 7,
      parcelaTotal: 8,
    });
    expect(parseInstallment("Pia 1,8 7/7")).toMatchObject({
      descricaoBase: "Pia 1,8",
      parcelaAtual: 7,
      parcelaTotal: 7,
    });
  });

  it("não trata carry-over nem numeração inválida como parcela", () => {
    expect(parseInstallment("FATURA PICPAY 1/7")).toBeNull();
    expect(parseInstallment("Compra 5/4")).toBeNull();
    expect(parseInstallment("Compra 1/61")).toBeNull();
  });
});

describe("detecção de layout", () => {
  it("detecta conta, cartão e layouts ambíguos", () => {
    expect(detectSheetKind(["Data", "Descrição", "Situação"])).toBe("conta");
    expect(detectSheetKind(["Data", "Descrição", "Fatura"])).toBe("cartao");
    expect(
      detectSheetKind(["Data", "Descrição", "Situação", "Fatura"]),
    ).toBe("desconhecida");
    expect(detectSheetKind(["Data", "Descrição"])).toBe("desconhecida");
  });
});

describe("linhas especiais", () => {
  it("classifica pagamento, investimento, saldo, correção, zero e carry-over", () => {
    expect(
      classifySpecialRow({
        descricao: "Pagamento de fatura - Nu - Agosto de 2022",
        categoriaNome: "Pagamento de fatura",
        valorCentavos: -1000,
      }),
    ).toBe("pagamento_fatura");
    expect(
      classifySpecialRow({
        descricao: "Pagamento de fatura",
        categoriaNome: "Pagamento de fatura",
        valorCentavos: 1000,
      }),
    ).toBe("pagamento_positivo");
    expect(
      classifySpecialRow({
        descricao: "DCA - BTC",
        categoriaNome: "Investimentos",
        valorCentavos: -6200,
      }),
    ).toBe("investimento");
    expect(
      classifySpecialRow({
        descricao: "Saldo Inicial",
        categoriaNome: "Outras receitas",
        valorCentavos: 68594,
      }),
    ).toBe("saldo_inicial");
    expect(
      classifySpecialRow({
        descricao: "correção de saldo",
        categoriaNome: "Outros",
        valorCentavos: -543,
      }),
    ).toBe("correcao_saldo");
    expect(
      classifySpecialRow({
        descricao: "FATURA C6 // MES 07",
        categoriaNome: "Outros",
        valorCentavos: -104569,
      }),
    ).toBe("carry_over");
    expect(
      classifySpecialRow({
        descricao: "Cartão Adicional",
        categoriaNome: "Outros",
        valorCentavos: -2500,
      }),
    ).toBe("cartao_adicional");
    expect(
      classifySpecialRow({
        descricao: "Transferência",
        categoriaNome: "Transferências",
        valorCentavos: 33242,
      }),
    ).toBe("transferencia");
    expect(
      classifySpecialRow({
        descricao: "Qualquer coisa",
        categoriaNome: "Outros",
        valorCentavos: 0,
      }),
    ).toBe("zero");
  });
});

describe("normalização de nomes", () => {
  it("remove acentos, caixa e espaços extras", () => {
    expect(normalizeEntityName("  Conta   Salário ")).toBe("conta salario");
    expect(normalizeHeader("Informações adicionais")).toBe(
      "informacoes adicionais",
    );
    expect(normalizeHeader("Situação")).toBe("situacao");
  });
});

describe("chave de duplicidade", () => {
  it("inclui origem, data, valor, descrição e parcela", () => {
    expect(
      spreadsheetDuplicateKey({
        origemNome: "Conta Salário",
        data: "2026-11-04",
        valorCentavos: 123456,
        descricao: " Mercado ",
        parcelaAtual: 2,
        parcelaTotal: 3,
      }),
    ).toBe("conta salario|2026-11-04|123456|mercado|2/3");
  });
});

describe("normalização de abas", () => {
  const sheets: SpreadsheetSheet[] = [
    {
      name: "Conta",
      headers: [
        "Data",
        "Descrição",
        "Categoria",
        "Valor",
        "Situação",
        "Tags",
        "Informações adicionais",
      ],
      rows: [
        ["01.08.2022", "Saldo Inicial", "Outras receitas", 685.94, "Pago", "", ""],
        ["02.08.2022", "Investimentos", "Investimentos", -400, "Pago", "", ""],
        ["03.08.2022", "Linha zero", "Outros", 0, "Pago", "", ""],
        [
          "04.08.2022",
          "Compra",
          "Compras",
          -10.5,
          "Não pago",
          "juntando",
          "Primeira linha\nSegunda linha",
        ],
      ],
    },
    {
      name: "Cartão",
      headers: [
        "Data",
        "Descrição",
        "Categoria",
        "Valor",
        "Fatura",
        "Tags",
        "Informações adicionais",
      ],
      rows: [
        ["05.08.2022", "Sky Team 4/4", "Compras", -44.47, "Setembro/2022", "", ""],
        [
          "06.08.2022",
          "FATURA PICPAY 1/7",
          "Outros",
          -108.12,
          "Agosto/2022",
          "",
          "",
        ],
      ],
    },
  ];

  it("mantém zeros, tags, observação multilinha e parcelas", () => {
    const analysis = analyzeSpreadsheet(sheets);
    expect(analysis.totals.rows).toBe(6);
    expect(analysis.totals.zeros).toBe(1);
    expect(analysis.sheets.map((sheet) => sheet.kind)).toEqual([
      "conta",
      "cartao",
    ]);

    const compra = analysis.rows.find((row) => row.descricao === "Compra");
    expect(compra).toMatchObject({
      valorCentavos: 1050,
      pago: false,
      tags: ["juntando"],
      observacao: "Primeira linha\nSegunda linha",
    });

    const parcela = analysis.rows.find(
      (row) => row.descricao === "Sky Team 4/4",
    );
    expect(parcela).toMatchObject({
      parcelaAtual: 4,
      parcelaTotal: 4,
      parcelaGrupoId: "parcela:cartao:sky team:4",
    });

    const carry = analysis.carryOver[0];
    expect(carry?.specialKind).toBe("carry_over");
    expect(carry?.parcelaAtual).toBeNull();
    expect(analysis.categories.some((item) => item.nome === "Compras")).toBe(
      true,
    );
  });

  it("aceita correção manual do tipo da aba", () => {
    const result = buildCanonicalRows(
      [
        {
          name: "Ambígua",
          headers: ["Data", "Descrição", "Valor", "Situação", "Fatura"],
          rows: [["01.08.2022", "Compra", -10, "Pago", "Agosto/2022"]],
        },
      ],
      { sheetKinds: { "Ambígua": "cartao" } },
    );
    expect(result.rows[0]?.sheetKind).toBe("cartao");
    expect(result.rows[0]?.faturaChave).toBe("2022-08");
    expect(result.rows[0]?.pago).toBe(true);
  });

  it("agrupa investimentos por aba, categoria e descrição-base", () => {
    const analysis = analyzeSpreadsheet(sheets);
    const investment = analysis.investments[0];
    expect(investment).toMatchObject({
      sheetName: "Conta",
      categoriaNome: "Investimentos",
      count: 1,
      totalCentavos: -40000,
    });
    expect(
      investmentGroupKey({
        sheetName: "Conta",
        categoriaNome: "Investimentos",
        descricao: "Investimentos",
      }),
    ).toBe(investment?.key);
  });
});

describe("conciliação automática por valor da fatura", () => {
  const cardSheet: SpreadsheetSheet = {
    name: "Cartão A",
    headers: [
      "Data",
      "Descrição",
      "Categoria",
      "Valor",
      "Fatura",
      "Tags",
      "Informações adicionais",
    ],
    rows: [
      ["01.01.2026", "Compra", "Compras", -100, "Janeiro/2026", "", ""],
      ["02.01.2026", "Estorno", "Outras receitas", 20, "Janeiro/2026", "", ""],
      ["03.01.2026", "FATURA ANTIGA", "Outros", -30, "Janeiro/2026", "", ""],
    ],
  };

  it("calcula o total por aba/fatura sem carry-over e casa por valor", () => {
    const analysis = analyzeSpreadsheet([cardSheet]);
    const totals = buildSheetInvoiceTotals(analysis.rows);
    expect(totals).toEqual([
      {
        sheetName: "Cartão A",
        faturaChave: "2026-01",
        totalCentavos: 8_000,
        count: 2,
      },
    ]);
    expect(
      findUniqueInvoiceMatch(
        {
          faturaChave: null,
          dataMonth: "2026-01",
          totalCentavos: 8_000,
        },
        totals,
      ),
    ).toMatchObject({ sheetName: "Cartão A", faturaChave: "2026-01" });
  });

  it("não escolhe quando mais de uma fatura tem o mesmo valor", () => {
    const second: SpreadsheetSheet = {
      ...cardSheet,
      name: "Cartão B",
    };
    const analysis = analyzeSpreadsheet([cardSheet, second]);
    const totals = buildSheetInvoiceTotals(analysis.rows);
    expect(
      findUniqueInvoiceMatch(
        {
          faturaChave: null,
          dataMonth: "2026-01",
          totalCentavos: 8_000,
        },
        totals,
      ),
    ).toBeNull();
  });
});
