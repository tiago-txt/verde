import { describe, expect, it } from "vitest";
import {
  aplicarEventosAoResumo,
  aplicarEventosAoSalsoDia,
  avaliarImpactoEstouro,
  calcularCiclo,
  calcularGastoDoCiclo,
  categoriasBloqueadas,
  cicloDaData,
  ciclosRelevantesParaMes,
  dataDeFechamento,
  encontrarConflitoDeCategorias,
  eventosDoCiclo,
  eventoPassaFiltros,
  expandirCategorias,
  intervaloDoCiclo,
  limiteDoCiclo,
  orcamentoVigenteNoCiclo,
  resumirEventos,
  type BudgetCycleConfig,
  type BudgetSpendingTransaction,
} from "./budgets";
import type { MonthSummary } from "./summary";

const budget: BudgetCycleConfig = {
  valorPadrao: 70000,
  diaFechamento: 10,
  antecedenciaCiclos: 0,
  dataInicio: "2026-01",
  dataFim: null,
};

function tx(
  data: string,
  valor: number,
  categoriaId: string | null,
  overrides: Partial<BudgetSpendingTransaction> = {},
): BudgetSpendingTransaction {
  return {
    tipo: "despesa",
    valor,
    data,
    categoriaId,
    ...overrides,
  };
}

describe("cicloDaData", () => {
  it("fechamento 1 equivale ao mês de calendário", () => {
    expect(cicloDaData("2026-01-01", 1)).toBe("2026-01");
    expect(cicloDaData("2026-01-31", 1)).toBe("2026-01");
    expect(cicloDaData("2026-12-31", 1)).toBe("2026-12");
  });

  it("fechamento 10: dia 9 fica no ciclo anterior e dia 10 no novo", () => {
    expect(cicloDaData("2026-11-09", 10)).toBe("2026-10");
    expect(cicloDaData("2026-11-10", 10)).toBe("2026-11");
    expect(cicloDaData("2026-11-30", 10)).toBe("2026-11");
    expect(cicloDaData("2026-12-09", 10)).toBe("2026-11");
    expect(cicloDaData("2026-12-10", 10)).toBe("2026-12");
  });

  it("fechamento 10 na virada do ano", () => {
    expect(cicloDaData("2027-01-09", 10)).toBe("2026-12");
    expect(cicloDaData("2027-01-10", 10)).toBe("2027-01");
  });

  it("fechamento 31 usa o último dia dos meses curtos", () => {
    expect(cicloDaData("2026-02-27", 31)).toBe("2026-01");
    expect(cicloDaData("2026-02-28", 31)).toBe("2026-02");
    expect(cicloDaData("2026-03-30", 31)).toBe("2026-02");
    expect(cicloDaData("2026-03-31", 31)).toBe("2026-03");
  });

  it("fechamento 31 considera ano bissexto", () => {
    expect(cicloDaData("2028-02-28", 31)).toBe("2028-01");
    expect(cicloDaData("2028-02-29", 31)).toBe("2028-02");
    expect(cicloDaData("2028-03-30", 31)).toBe("2028-02");
  });
});

describe("intervaloDoCiclo e dataDeFechamento", () => {
  it("fechamento 10: 10/11 a 09/12 e acerto em 10/12", () => {
    expect(intervaloDoCiclo("2026-11", 10)).toEqual({
      inicio: "2026-11-10",
      fim: "2026-12-09",
    });
    expect(dataDeFechamento("2026-11", 10)).toBe("2026-12-10");
  });

  it("fechamento 1: mês de calendário", () => {
    expect(intervaloDoCiclo("2026-02", 1)).toEqual({
      inicio: "2026-02-01",
      fim: "2026-02-28",
    });
    expect(dataDeFechamento("2026-02", 1)).toBe("2026-03-01");
  });

  it("fechamento 31 em janeiro termina em 27/02", () => {
    expect(intervaloDoCiclo("2026-01", 31)).toEqual({
      inicio: "2026-01-31",
      fim: "2026-02-27",
    });
    expect(dataDeFechamento("2026-01", 31)).toBe("2026-02-28");
  });

  it("ciclo atravessa a virada do ano", () => {
    expect(intervaloDoCiclo("2026-12", 10)).toEqual({
      inicio: "2026-12-10",
      fim: "2027-01-09",
    });
    expect(dataDeFechamento("2026-12", 10)).toBe("2027-01-10");
  });

  it("lista ciclos relevantes para o mês", () => {
    expect(ciclosRelevantesParaMes("2026-11")).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
    ]);
  });
});

describe("gasto, restante e estouro", () => {
  const categories = new Set(["mercado", "mercado-filho"]);

  it("conta apenas despesas, pagas ou não, dentro da janela e da categoria", () => {
    const transactions = [
      tx("2026-11-10", 10000, "mercado", { pago: true }),
      tx("2026-12-09", 5000, "mercado-filho", { pago: false }),
      tx("2026-11-15", 2000, "mercado", { tipo: "receita" }),
      tx("2026-11-15", 3000, "mercado", { tipo: "transferencia" }),
      tx("2026-11-15", 4000, "lazer"),
      tx("2026-12-10", 7000, "mercado"),
      tx("2026-11-20", 9000, "mercado", { deletedAt: new Date() }),
    ];

    expect(
      calcularGastoDoCiclo(transactions, categories, "2026-11-10", "2026-12-09"),
    ).toBe(15000);
  });

  it("subcategoria conta automaticamente", () => {
    const expanded = expandirCategorias(
      [
        { id: "mercado", categoriaPaiId: null },
        { id: "mercado-filho", categoriaPaiId: "mercado" },
        { id: "lazer", categoriaPaiId: null },
      ],
      ["mercado"],
    );
    expect([...expanded].sort()).toEqual(["mercado", "mercado-filho"]);
  });

  it("calcula limite, restante, estouro e percentual", () => {
    const result = calcularCiclo(budget, "2026-11", 30000);
    expect(result).toMatchObject({
      ciclo: "2026-11",
      inicio: "2026-11-10",
      fim: "2026-12-09",
      fechamento: "2026-12-10",
      limite: 70000,
      gasto: 30000,
      restante: 40000,
      estouro: 0,
    });
    expect(result.percentual).toBe(43);
  });

  it("estouro zera o restante", () => {
    const result = calcularCiclo(budget, "2026-11", 82000);
    expect(result.restante).toBe(0);
    expect(result.estouro).toBe(12000);
    expect(result.percentual).toBe(117);
  });
});

describe("eventos de provisão e sobra", () => {
  it("provisão no início e sobra no fechamento", () => {
    const events = eventosDoCiclo(budget, "2026-11", 30000);
    expect(events).toEqual([
      { tipo: "provisao", data: "2026-11-10", valor: 40000, ciclo: "2026-11" },
      { tipo: "sobra", data: "2026-12-10", valor: 40000, ciclo: "2026-11" },
    ]);
  });

  it("com antecedência 1 a provisão cai no início do ciclo anterior", () => {
    const events = eventosDoCiclo(
      { ...budget, antecedenciaCiclos: 1 },
      "2026-11",
      30000,
    );
    expect(events[0]).toEqual({
      tipo: "provisao",
      data: "2026-10-10",
      valor: 40000,
      ciclo: "2026-11",
    });
  });

  it("estouro não gera provisão nem sobra", () => {
    expect(eventosDoCiclo(budget, "2026-11", 82000)).toEqual([]);
  });

  it("gasto igual ao limite não gera eventos", () => {
    expect(eventosDoCiclo(budget, "2026-11", 70000)).toEqual([]);
  });

  it("sem gasto, provisão + sobra se anulam", () => {
    const events = eventosDoCiclo(budget, "2026-11", 0);
    const resumo = resumirEventos(events);
    expect(resumo).toEqual({
      provisoes: 70000,
      sobras: 70000,
      liquido: 0,
    });
  });

  it("cada evento aparece no mês da sua data", () => {
    const events = eventosDoCiclo(budget, "2026-11", 30000);
    expect(events.filter((event) => event.data.startsWith("2026-11"))).toHaveLength(1);
    expect(events.filter((event) => event.data.startsWith("2026-12"))).toHaveLength(1);
  });

  it("respeita vigência, arquivamento e override", () => {
    expect(
      eventosDoCiclo({ ...budget, dataInicio: "2026-12" }, "2026-11", 0),
    ).toEqual([]);
    expect(
      eventosDoCiclo({ ...budget, dataFim: "2026-10" }, "2026-11", 0),
    ).toEqual([]);
    expect(eventosDoCiclo({ ...budget, arquivado: true }, "2026-11", 0)).toEqual([]);

    const override = eventosDoCiclo(
      budget,
      "2026-11",
      10000,
      { "2026-11": 20000 },
    );
    expect(override[0]?.valor).toBe(10000);

    expect(limiteDoCiclo(budget, "2026-11", { "2026-11": 20000 })).toBe(20000);
    expect(limiteDoCiclo(budget, "2026-11")).toBe(70000);
  });

  it("valida vigência inclusiva", () => {
    expect(orcamentoVigenteNoCiclo(budget, "2026-01")).toBe(true);
    expect(orcamentoVigenteNoCiclo({ ...budget, dataFim: "2026-03" }, "2026-03")).toBe(true);
    expect(orcamentoVigenteNoCiclo({ ...budget, dataFim: "2026-03" }, "2026-04")).toBe(false);
    expect(orcamentoVigenteNoCiclo({ ...budget, dataInicio: "2026-04" }, "2026-03")).toBe(false);
  });
});

describe("resumo previsto sem contagem dupla", () => {
  const base: MonthSummary = {
    entradasPagas: 50000,
    saidasPagas: 20000,
    entradasPrevistas: 60000,
    saidasPrevistas: 30000,
    saldoRealizado: 30000,
    saldoPrevisto: 30000,
  };

  it("incorpora provisões e sobras apenas no previsto e nas entradas/saídas", () => {
    const events = [
      { tipo: "provisao" as const, data: "2026-11-10", valor: 70000, ciclo: "2026-11" },
      { tipo: "sobra" as const, data: "2026-11-20", valor: 40000, ciclo: "2026-10" },
    ];
    const result = aplicarEventosAoResumo(base, events);

    expect(result.saldoRealizado).toBe(30000);
    expect(result.saidasPrevistas).toBe(100000);
    expect(result.entradasPrevistas).toBe(100000);
    expect(result.saldoPrevisto).toBe(0);
    expect(result.provisoesOrcamento).toBe(70000);
    expect(result.sobrasOrcamento).toBe(40000);
  });

  it("vários orçamentos somam sem duplicar o limite", () => {
    const events = [
      ...eventosDoCiclo(budget, "2026-11", 30000),
      ...eventosDoCiclo(
        { ...budget, valorPadrao: 20000 },
        "2026-11",
        5000,
      ),
    ];
    const resumo = resumirEventos(events);
    expect(resumo.provisoes).toBe(55000);
    expect(resumo.sobras).toBe(55000);
    expect(resumo.liquido).toBe(0);
  });

  it("eventos afetam o saldo previsto do dia, não o realizado", () => {
    const balances = {
      "2026-11-09": 10000,
      "2026-11-10": 10000,
      "2026-11-20": 10000,
      "2026-12-09": 10000,
      "2026-12-10": 10000,
    };
    const events = eventosDoCiclo(budget, "2026-11", 30000);
    const result = aplicarEventosAoSalsoDia(balances, events);

    expect(result["2026-11-09"]).toBe(10000);
    expect(result["2026-11-10"]).toBe(10000 - 40000);
    expect(result["2026-11-20"]).toBe(10000 - 40000);
    expect(result["2026-12-10"]).toBe(10000);
  });

  it("provisão aberta no mês anterior carrega para o saldo do mês seguinte", () => {
    const balances = {
      "2026-11-09": 10000,
      "2026-11-10": 10000,
    };
    const events = [
      // Provisão do ciclo de outubro (10/10), ainda não fechada em 09/11.
      { tipo: "provisao" as const, data: "2026-10-10", valor: 40000, ciclo: "2026-10" },
      // Sobra do ciclo de outubro no fechamento (10/11).
      { tipo: "sobra" as const, data: "2026-11-10", valor: 40000, ciclo: "2026-10" },
    ];
    const result = aplicarEventosAoSalsoDia(balances, events);

    expect(result["2026-11-09"]).toBe(10000 - 40000);
    expect(result["2026-11-10"]).toBe(10000);
  });
});

describe("categorias sincronizadas", () => {
  const categories = [
    { id: "mercado", categoriaPaiId: null },
    { id: "mercado-filho", categoriaPaiId: "mercado" },
    { id: "lazer", categoriaPaiId: null },
    { id: "lazer-filho", categoriaPaiId: "lazer" },
  ];

  it("bloqueia descendentes e ancestrais de categoria usada", () => {
    const blocked = categoriasBloqueadas(categories, [
      { budgetId: "b1", budgetNome: "Cartão Nu", categoriaIds: ["mercado"] },
    ]);
    expect(blocked.get("mercado")).toBe("Cartão Nu");
    expect(blocked.get("mercado-filho")).toBe("Cartão Nu");
    expect(blocked.has("lazer")).toBe(false);

    const blockedByChild = categoriasBloqueadas(categories, [
      {
        budgetId: "b2",
        budgetNome: "Lazer",
        categoriaIds: ["lazer-filho"],
      },
    ]);
    expect(blockedByChild.get("lazer")).toBe("Lazer");
    expect(blockedByChild.get("lazer-filho")).toBe("Lazer");
  });

  it("detecta conflito entre categorias escolhidas e outro orçamento", () => {
    const usages = [
      { budgetId: "b1", budgetNome: "Cartão Nu", categoriaIds: ["mercado"] },
    ];
    expect(
      encontrarConflitoDeCategorias(categories, ["mercado-filho"], usages),
    ).toEqual({ categoryId: "mercado-filho", budgetNome: "Cartão Nu" });
    expect(
      encontrarConflitoDeCategorias(categories, ["mercado"], usages, "b1"),
    ).toBeNull();
    expect(
      encontrarConflitoDeCategorias(categories, ["lazer"], usages),
    ).toBeNull();
  });
});

describe("impacto de lançamentos", () => {
  it("classifica antes/depois do estouro", () => {
    expect(avaliarImpactoEstouro(0, 0)).toBe("sem-estouro");
    expect(avaliarImpactoEstouro(0, 12000)).toBe("passou-a-estourar");
    expect(avaliarImpactoEstouro(12000, 20000)).toBe("aumentou");
    expect(avaliarImpactoEstouro(20000, 12000)).toBe("diminuiu");
    expect(avaliarImpactoEstouro(12000, 12000)).toBe("manteve");
  });

  it("novo lançamento pode fazer o ciclo passar a estourar", () => {
    const antes = calcularCiclo(budget, "2026-11", 65000);
    const depois = calcularCiclo(budget, "2026-11", 82000);
    expect(antes.estouro).toBe(0);
    expect(avaliarImpactoEstouro(antes.estouro, depois.estouro)).toBe(
      "passou-a-estourar",
    );
  });

  it("mudar a categoria recalcula o gasto (entre ou para fora do orçamento)", () => {
    const categories = new Set(["mercado"]);
    const transactions = [tx("2026-11-15", 30000, "mercado")];

    const dentro = calcularGastoDoCiclo(
      transactions,
      categories,
      "2026-11-10",
      "2026-12-09",
    );
    expect(dentro).toBe(30000);

    const movidoParaLazer = transactions.map((item) => ({
      ...item,
      categoriaId: "lazer",
    }));
    expect(
      calcularGastoDoCiclo(
        movidoParaLazer,
        categories,
        "2026-11-10",
        "2026-12-09",
      ),
    ).toBe(0);
  });

  it("editar valor e remover lançamento devolvem o restante", () => {
    const antes = calcularCiclo(budget, "2026-11", 82000);
    const depois = calcularCiclo(budget, "2026-11", 30000);
    expect(antes.restante).toBe(0);
    expect(depois.restante).toBe(40000);
    expect(avaliarImpactoEstouro(antes.estouro, depois.estouro)).toBe(
      "sem-estouro",
    );
  });

  it("processa 500+ lançamentos sem N+1 (função pura)", () => {
    const transactions = Array.from({ length: 800 }, (_, index) =>
      tx(
        index % 2 === 0 ? "2026-11-15" : "2026-12-01",
        100,
        index % 3 === 0 ? "lazer" : "mercado",
      ),
    );
    const total = calcularGastoDoCiclo(
      transactions,
      new Set(["mercado"]),
      "2026-11-10",
      "2026-12-09",
    );
    expect(total).toBeGreaterThan(0);
  });
});

describe("filtros da tela de lançamentos", () => {
  const filters = {
    tipo: null,
    categorias: [],
    contas: [],
    tags: [],
    status: "todos" as const,
    q: null,
  };
  const provision = {
    tipo: "provisao" as const,
    budgetNome: "Cartão Nu",
    categoriaIds: ["mercado", "mercado-filho"],
    contaId: "conta-1",
  };
  const sobra = { ...provision, tipo: "sobra" as const };

  it("provisão só aparece em despesa; sobra só em receita", () => {
    expect(
      eventoPassaFiltros(provision, { ...filters, tipo: "despesa" }),
    ).toBe(true);
    expect(
      eventoPassaFiltros(provision, { ...filters, tipo: "receita" }),
    ).toBe(false);
    expect(
      eventoPassaFiltros(sobra, { ...filters, tipo: "receita" }),
    ).toBe(true);
    expect(
      eventoPassaFiltros(sobra, { ...filters, tipo: "transferencia" }),
    ).toBe(false);
  });

  it("filtra por categoria sincronizada, conta e busca pelo nome", () => {
    expect(
      eventoPassaFiltros(provision, {
        ...filters,
        categorias: ["mercado-filho"],
      }),
    ).toBe(true);
    expect(
      eventoPassaFiltros(provision, { ...filters, categorias: ["lazer"] }),
    ).toBe(false);
    expect(
      eventoPassaFiltros(provision, { ...filters, contas: ["conta-2"] }),
    ).toBe(false);
    expect(
      eventoPassaFiltros(provision, { ...filters, q: "nu" }),
    ).toBe(true);
    expect(
      eventoPassaFiltros(provision, { ...filters, q: "mercado" }),
    ).toBe(false);
  });

  it("some com filtros de status ou tags", () => {
    expect(
      eventoPassaFiltros(provision, { ...filters, status: "pagos" }),
    ).toBe(false);
    expect(
      eventoPassaFiltros(provision, { ...filters, tags: ["tag-1"] }),
    ).toBe(false);
  });
});
