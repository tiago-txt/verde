import { describe, expect, it } from "vitest";
import {
  aplicarFaturasAoResumo,
  calcularLimiteUsado,
  datasDaFatura,
  eventoDaFatura,
  faturaDaCompra,
  faturaPassaFiltros,
  intervaloDaFatura,
  limiteDisponivel,
  resumirFatura,
  statusDaFatura,
  totalDaFatura,
  type CardInvoiceSummary,
} from "./cards";
import {
  calcularCiclo,
  eventosDoCiclo,
  resumirEventos,
} from "./budgets";
import { computeAccountBalance, type BalanceTransaction } from "./balance";
import { buildInstallmentPlan, installmentTotal } from "./installments";
import type { MonthSummary } from "./summary";

const nu = { diaFechamento: 10, diaVencimento: 17 };
const visa = { diaFechamento: 10, diaVencimento: 5 };
const closing31 = { diaFechamento: 31, diaVencimento: 10 };
const dueEqualClosing = { diaFechamento: 10, diaVencimento: 10 };

describe("faturaDaCompra", () => {
  it("compra antes do fechamento e no dia do fechamento", () => {
    expect(faturaDaCompra("2026-11-15", nu)).toBe("2026-12");
    expect(faturaDaCompra("2026-12-09", nu)).toBe("2026-12");
    // No dia do fechamento entra na fatura seguinte.
    expect(faturaDaCompra("2026-12-10", nu)).toBe("2027-01");
  });

  it("vencimento menor que fechamento cai no mês seguinte", () => {
    expect(faturaDaCompra("2026-11-15", visa)).toBe("2027-01");
    expect(faturaDaCompra("2026-12-09", visa)).toBe("2027-01");
    expect(faturaDaCompra("2026-12-10", visa)).toBe("2027-02");
  });

  it("vencimento igual ao fechamento também cai no mês seguinte", () => {
    expect(faturaDaCompra("2026-11-15", dueEqualClosing)).toBe("2027-01");
  });

  it("fechamento 31 em mês curto e bissexto", () => {
    expect(faturaDaCompra("2026-02-27", closing31)).toBe("2026-03");
    expect(faturaDaCompra("2026-02-28", closing31)).toBe("2026-04");
    expect(faturaDaCompra("2028-02-28", closing31)).toBe("2028-03");
    expect(faturaDaCompra("2028-02-29", closing31)).toBe("2028-04");
  });

  it("virada do ano", () => {
    expect(faturaDaCompra("2026-12-31", nu)).toBe("2027-01");
    expect(faturaDaCompra("2027-01-09", nu)).toBe("2027-01");
  });
});

describe("datasDaFatura e intervaloDaFatura", () => {
  it("fatura de dezembro: compras 10/11–09/12, vence 17/12", () => {
    expect(datasDaFatura("2026-12", nu)).toEqual({
      chave: "2026-12",
      inicio: "2026-11-10",
      fechamento: "2026-12-10",
      vencimento: "2026-12-17",
    });
    expect(intervaloDaFatura("2026-12", nu)).toEqual({
      inicio: "2026-11-10",
      fim: "2026-12-09",
    });
  });

  it("vencimento antes do fechamento: fatura de janeiro fecha em dezembro", () => {
    expect(datasDaFatura("2027-01", visa)).toEqual({
      chave: "2027-01",
      inicio: "2026-11-10",
      fechamento: "2026-12-10",
      vencimento: "2027-01-05",
    });
  });

  it("fechamento 31 ajusta meses curtos", () => {
    expect(datasDaFatura("2026-04", closing31)).toEqual({
      chave: "2026-04",
      inicio: "2026-02-28",
      fechamento: "2026-03-31",
      vencimento: "2026-04-10",
    });
  });
});

describe("total e status da fatura", () => {
  it("estornos reduzem o total", () => {
    expect(
      totalDaFatura([
        { tipo: "despesa", valor: 20000, data: "2026-11-15" },
        { tipo: "receita", valor: 5000, data: "2026-11-20" },
      ]),
    ).toBe(15000);
  });

  it("aberta, fechada, parcial, paga e vencida", () => {
    expect(
      statusDaFatura({
        total: 20000,
        pago: 0,
        fechamento: "2026-12-10",
        vencimento: "2026-12-17",
        hoje: "2026-11-20",
      }),
    ).toMatchObject({ status: "aberta", vencida: false, restante: 20000 });

    expect(
      statusDaFatura({
        total: 20000,
        pago: 0,
        fechamento: "2026-12-10",
        vencimento: "2026-12-17",
        hoje: "2026-12-11",
      }),
    ).toMatchObject({ status: "fechada", vencida: false });

    expect(
      statusDaFatura({
        total: 20000,
        pago: 5000,
        fechamento: "2026-12-10",
        vencimento: "2026-12-17",
        hoje: "2026-12-18",
      }),
    ).toMatchObject({
      status: "parcial",
      vencida: true,
      restante: 15000,
    });

    expect(
      statusDaFatura({
        total: 20000,
        pago: 20000,
        fechamento: "2026-12-10",
        vencimento: "2026-12-17",
        hoje: "2026-12-18",
      }),
    ).toMatchObject({ status: "paga", vencida: false, restante: 0 });
  });

  it("pagamento acima do total vira crédito", () => {
    expect(
      statusDaFatura({
        total: 20000,
        pago: 25000,
        fechamento: "2026-12-10",
        vencimento: "2026-12-17",
        hoje: "2026-12-18",
      }),
    ).toMatchObject({ status: "paga", restante: 0, credito: 5000 });
  });

  it("pagamento não pago não quita a fatura", () => {
    const fatura = resumirFatura({
      chave: "2026-12",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [{ valor: 20000, pago: false, faturaChave: "2026-12" }],
      hoje: "2026-12-18",
    });
    expect(fatura.pago).toBe(0);
    expect(fatura.status).toBe("fechada");
    expect(fatura.restante).toBe(20000);
  });

  it("desfazer o pagamento reabre a fatura", () => {
    const pago = resumirFatura({
      chave: "2026-12",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [{ valor: 20000, pago: true, faturaChave: "2026-12" }],
      hoje: "2026-12-18",
    });
    expect(pago.status).toBe("paga");

    const desfeito = resumirFatura({
      chave: "2026-12",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [],
      hoje: "2026-12-18",
    });
    expect(desfeito.status).toBe("fechada");
    expect(desfeito.restante).toBe(20000);
  });
});

describe("limite usado e disponível", () => {
  const faturas = [
    { restante: 10000 },
    { restante: 0 },
    { restante: 5000 },
  ];

  it("soma os saldos devedores de todas as faturas", () => {
    expect(calcularLimiteUsado(faturas)).toBe(15000);
    expect(limiteDisponivel(20000, 15000)).toBe(5000);
    expect(limiteDisponivel(10000, 15000)).toBe(-5000);
  });
});

describe("parcelamento no cartão", () => {
  it("distribui uma parcela por fatura e preserva o total", () => {
    const plan = buildInstallmentPlan({
      valorCents: 10000,
      parcelas: 3,
      dataInicio: "2026-11-15",
      baseValor: "total",
    });

    expect(plan.map((item) => faturaDaCompra(item.data, nu))).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(plan.map((item) => item.valor)).toEqual([3334, 3333, 3333]);
    expect(installmentTotal(plan)).toBe(10000);
  });

  it("datas no fim do mês são ajustadas sem pular fatura", () => {
    const plan = buildInstallmentPlan({
      valorCents: 30000,
      parcelas: 3,
      dataInicio: "2026-01-31",
      baseValor: "total",
    });
    expect(plan.map((item) => item.data)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(plan.map((item) => faturaDaCompra(item.data, closing31))).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
    ]);
  });
});

describe("resumo previsto e eventos de fatura", () => {
  const base: MonthSummary = {
    entradasPagas: 0,
    saidasPagas: 0,
    entradasPrevistas: 0,
    saidasPrevistas: 0,
    saldoRealizado: 0,
    saldoPrevisto: 0,
  };

  it("adiciona apenas o restante da fatura ao previsto", () => {
    const fatura = resumirFatura({
      chave: "2026-12",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [{ valor: 5000, pago: true, faturaChave: "2026-12" }],
      hoje: "2026-11-20",
    });
    const resumo = aplicarFaturasAoResumo(base, [fatura]);

    expect(resumo.faturasCartao).toBe(15000);
    expect(resumo.saidasPrevistas).toBe(15000);
    expect(resumo.saldoPrevisto).toBe(-15000);
    expect(resumo.saldoRealizado).toBe(0);
  });

  it("fatura quitada não gera evento virtual", () => {
    const fatura = resumirFatura({
      chave: "2026-12",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [{ valor: 20000, pago: true, faturaChave: "2026-12" }],
      hoje: "2026-11-20",
    });
    expect(eventoDaFatura(fatura)).toBeNull();
  });

  it("provisão, sobra e fatura não duplicam o gasto no previsto", () => {
    const ciclo = "2026-11";
    const budget = {
      valorPadrao: 70000,
      diaFechamento: 10,
      antecedenciaCiclos: 0,
      dataInicio: "2026-11",
      dataFim: null,
    };
    const semGasto = eventosDoCiclo(budget, ciclo, 0);
    const comGasto = eventosDoCiclo(budget, ciclo, 20000);

    // Provisão cai de 700 para 500; sobra idem. A fatura de 200 vence no ciclo.
    const fatura = resumirFatura({
      chave: "2026-11",
      card: nu,
      movimentos: [{ tipo: "despesa", valor: 20000, data: "2026-11-15" }],
      pagamentos: [],
      hoje: "2026-11-20",
    });
    const evento = eventoDaFatura(fatura);

    const antes = resumirEventos(semGasto);
    const depois = resumirEventos(comGasto);
    const liquidoOrcamento = depois.liquido - antes.liquido;
    const liquidoFatura = evento ? -evento.valor : 0;

    // Ao final do ciclo provisão e sobra se anulam; a fatura é a única saída
    // líquida. O total é -200, nunca -400 (dupla contagem).
    expect(liquidoOrcamento).toBe(0);
    expect(liquidoFatura).toBe(-20000);
    expect(liquidoOrcamento + liquidoFatura).toBe(-20000);
  });

  it("compra no cartão consome o orçamento pela data da compra", () => {
    const budget = {
      valorPadrao: 70000,
      diaFechamento: 10,
      antecedenciaCiclos: 0,
      dataInicio: "2026-11",
      dataFim: null,
    };
    const cicloCompra = "2026-11";
    const info = calcularCiclo(budget, cicloCompra, 20000);
    expect(info.gasto).toBe(20000);
    expect(info.restante).toBe(50000);
    // O fechamento do cartão e do orçamento coincidem quando configurado.
    expect(datasDaFatura("2026-12", nu).fechamento).toBe(
      info.fechamento,
    );
  });

  it("compra + pagamento da fatura não duplicam a saída da conta", () => {
    const conta = { id: "conta", saldoInicial: 100_000 };
    const compra: BalanceTransaction = {
      tipo: "despesa",
      valor: 20_000,
      pago: false,
      contaId: null,
      contaDestinoId: null,
      cartaoId: "card-1",
    };
    const pagamento: BalanceTransaction = {
      tipo: "transferencia",
      valor: 20_000,
      pago: true,
      contaId: "conta",
      contaDestinoId: null,
      cartaoId: null,
      cartaoDestinoId: "card-1",
      faturaChave: "2026-12",
    };

    expect(computeAccountBalance(conta, [compra], "previsto")).toBe(100_000);
    expect(
      computeAccountBalance(conta, [compra, pagamento], "previsto"),
    ).toBe(80_000);
    expect(
      computeAccountBalance(conta, [compra, pagamento], "atual"),
    ).toBe(80_000);
  });
});

describe("filtros da fatura virtual", () => {
  const fatura = {
    restante: 15000,
    cartaoId: "card-1",
    cartaoNome: "Nu",
    contaPagamentoId: "conta-1",
  };
  const filters = {
    tipo: null,
    cartoes: [],
    contas: [],
    categorias: [],
    tags: [],
    status: "todos" as const,
    q: null,
  };

  it("aparece como despesa e some em receita/transferência", () => {
    expect(faturaPassaFiltros(fatura, filters)).toBe(true);
    expect(
      faturaPassaFiltros(fatura, { ...filters, tipo: "despesa" }),
    ).toBe(true);
    expect(
      faturaPassaFiltros(fatura, { ...filters, tipo: "receita" }),
    ).toBe(false);
    expect(
      faturaPassaFiltros(fatura, { ...filters, tipo: "transferencia" }),
    ).toBe(false);
  });

  it("respeita cartão, conta e busca", () => {
    expect(
      faturaPassaFiltros(fatura, { ...filters, cartoes: ["card-1"] }),
    ).toBe(true);
    expect(
      faturaPassaFiltros(fatura, { ...filters, cartoes: ["card-2"] }),
    ).toBe(false);
    expect(
      faturaPassaFiltros(fatura, { ...filters, contas: ["conta-2"] }),
    ).toBe(false);
    expect(faturaPassaFiltros(fatura, { ...filters, q: "nu" })).toBe(true);
    expect(faturaPassaFiltros(fatura, { ...filters, q: "visa" })).toBe(false);
  });

  it("some com status, tags ou categorias", () => {
    expect(
      faturaPassaFiltros(fatura, { ...filters, status: "pagos" }),
    ).toBe(false);
    expect(
      faturaPassaFiltros(fatura, { ...filters, tags: ["tag"] }),
    ).toBe(false);
    expect(
      faturaPassaFiltros(fatura, { ...filters, categorias: ["mercado"] }),
    ).toBe(false);
  });

  it("fatura quitada não aparece", () => {
    expect(
      faturaPassaFiltros({ ...fatura, restante: 0 }, filters),
    ).toBe(false);
  });
});
