import { describe, expect, it } from "vitest";
import {
  causasDoPeriodo,
  construirProjecao,
  detectarPeriodosNegativos,
  encontrarRecuperacao,
  parcelaMaximaSegura,
  resumoMensal,
  simular,
  type ForecastAccount,
  type ForecastEvent,
  type ForecastInput,
} from "./forecast";

const HOJE = "2026-11-12";
const FIM = "2027-11-30";

const conta: ForecastAccount = {
  id: "conta-1",
  nome: "Conta",
  tipo: "corrente",
  cor: "#34d399",
  icone: "Wallet",
  saldoAtual: 100_000,
};

function evento(patch: Partial<ForecastEvent> & Pick<ForecastEvent, "data" | "tipo" | "valor">): ForecastEvent {
  return {
    id: crypto.randomUUID(),
    contaId: conta.id,
    kind: "transacao",
    certeza: "certo",
    descricao: "Evento",
    ...patch,
  };
}

function input(eventos: ForecastEvent[], patch: Partial<ForecastInput> = {}): ForecastInput {
  return {
    hoje: HOJE,
    fim: FIM,
    margem: 0,
    contas: [conta],
    eventos,
    incluirEstimativas: true,
    ...patch,
  };
}

describe("previsão de saldo", () => {
  it("sem eventos a série é reta e o primeiro ponto é o saldo atual", () => {
    const projection = construirProjecao(input([]));
    expect(projection.pontos[0]?.saldo).toBe(100_000);
    expect(projection.pontos.at(-1)?.saldo).toBe(100_000);
    expect(projection.pontos.every((point) => point.saldo === 100_000)).toBe(true);
    expect(projection.eventos.reduce((sum, event) => sum + (event.tipo === "entrada" ? event.valor : -event.valor), 0)).toBe(0);
  });

  it("soma dos eventos explica a variação total", () => {
    const eventos = [
      evento({ data: "2026-12-05", tipo: "saida", valor: 30_000 }),
      evento({ data: "2026-12-20", tipo: "entrada", valor: 80_000 }),
    ];
    const projection = construirProjecao(input(eventos));
    expect(projection.pontos.at(-1)?.saldo).toBe(150_000);
    expect(projection.pontos.at(-1)!.saldo - projection.saldoInicial).toBe(50_000);
  });

  it("salário no fim do mês recupera o negativo intra-mês", () => {
    const eventos = [
      evento({ data: "2026-12-05", tipo: "saida", valor: 180_000, descricao: "Despesas" }),
      evento({ data: "2026-12-25", tipo: "entrada", valor: 200_000, descricao: "Salário" }),
    ];
    const projection = construirProjecao(input(eventos));
    const periods = detectarPeriodosNegativos(projection);
    expect(periods).toHaveLength(1);
    expect(periods[0]?.inicio).toBe("2026-12-05");
    expect(periods[0]?.menorSaldo).toBe(-80_000);
    const recovery = encontrarRecuperacao(projection, periods[0]!);
    expect(recovery?.data).toBe("2026-12-25");
    expect(recovery?.evento.descricao).toBe("Salário");
  });

  it("parcelas 12x ficam negativas na 6ª e recuperam com 13º", () => {
    const eventos: ForecastEvent[] = Array.from({ length: 12 }, (_, index) =>
      evento({
        id: `parcela-${index + 1}`,
        data: `2026-${String(12 + index).padStart(2, "0")}-05`.replace(
          /^2026-(1[3-9]|2[0-3])-/,
          (match) => `${2027}-${String(Number(match.slice(5, 7)) - 12).padStart(2, "0")}-`,
        ),
        tipo: "saida",
        valor: 40_000,
        descricao: "TV",
        parcelaGrupoId: "tv",
        parcelaAtual: index + 1,
        parcelaTotal: 12,
      }),
    );
    eventos.push(
      evento({
        data: "2027-11-20",
        tipo: "entrada",
        valor: 600_000,
        descricao: "13º salário",
        kind: "recorrencia",
      }),
    );

    const projection = construirProjecao(input(eventos));
    const periods = detectarPeriodosNegativos(projection);
    expect(periods.length).toBeGreaterThan(0);
    expect(periods[0]?.menorSaldo).toBeLessThan(0);
    const recovery = encontrarRecuperacao(projection, periods[0]!);
    expect(recovery?.data).toBe("2027-11-20");
    expect(recovery?.evento.descricao).toBe("13º salário");
    const causas = causasDoPeriodo(projection, periods[0]!);
    expect(causas[0]?.label).toContain("Parcelas da TV");
  });

  it("reserva, liberação e transferência nunca causam recuperação", () => {
    const eventos = [
      evento({ data: "2026-12-05", tipo: "saida", valor: 200_000, descricao: "Compra" }),
      evento({
        data: "2026-12-10",
        tipo: "entrada",
        valor: 300_000,
        descricao: "Liberação",
        kind: "liberacao",
      }),
    ];
    const projection = construirProjecao(input(eventos));
    const period = detectarPeriodosNegativos(projection)[0]!;
    expect(encontrarRecuperacao(projection, period)).toBeNull();

    const withTransfer = construirProjecao(
      input([
        evento({ data: "2026-12-05", tipo: "saida", valor: 200_000, descricao: "Compra" }),
        evento({
          data: "2026-12-10",
          tipo: "transferencia",
          valor: 300_000,
          descricao: "Transferência",
          contaDestinoId: "conta-2",
        }),
      ], {
        contas: [
          conta,
          { ...conta, id: "conta-2", nome: "Outra", saldoAtual: 0 },
        ],
      }),
    );
    const transferPeriod = detectarPeriodosNegativos(withTransfer)[0]!;
    expect(encontrarRecuperacao(withTransfer, transferPeriod)).toBeNull();
  });

  it("sem recuperação no horizonte e vários períodos separados", () => {
    const eventos = [
      evento({ data: "2026-12-05", tipo: "saida", valor: 150_000 }),
      evento({ data: "2027-01-05", tipo: "entrada", valor: 200_000 }),
      evento({ data: "2027-02-05", tipo: "saida", valor: 300_000 }),
    ];
    const projection = construirProjecao(input(eventos));
    const periods = detectarPeriodosNegativos(projection);
    expect(periods).toHaveLength(2);
    expect(periods[1]?.semRecuperacao).toBe(true);
    expect(encontrarRecuperacao(projection, periods[1]!)).toBeNull();
  });

  it("margem positiva considera negativo abaixo da margem", () => {
    const projection = construirProjecao(
      input([evento({ data: "2026-12-05", tipo: "saida", valor: 60_000 })], {
        margem: 50_000,
      }),
    );
    expect(detectarPeriodosNegativos(projection)).toHaveLength(1);
    expect(projection.pontos.at(-1)?.saldo).toBe(40_000);
  });

  it("atrasados entram em hoje", () => {
    const projection = construirProjecao(
      input([evento({ data: "2026-10-01", tipo: "saida", valor: 30_000 })]),
    );
    expect(projection.eventos[0]?.data).toBe(HOJE);
    expect(projection.pontos.at(-1)?.saldo).toBe(70_000);
  });

  it("transferências se anulam no total e afetam cada conta", () => {
    const outra = { ...conta, id: "conta-2", nome: "Outra", saldoAtual: 0 };
    const projection = construirProjecao(
      input(
        [
          evento({
            data: "2026-12-10",
            tipo: "transferencia",
            valor: 40_000,
            contaDestinoId: "conta-2",
          }),
        ],
        { contas: [conta, outra] },
      ),
    );
    const point = projection.pontos.at(-1)!;
    expect(point.saldo).toBe(100_000);
    expect(point.porConta["conta-1"]).toBe(60_000);
    expect(point.porConta["conta-2"]).toBe(40_000);
  });

  it("conta fora do escopo não entra", () => {
    const projection = construirProjecao(
      input([
        evento({
          data: "2026-12-10",
          tipo: "saida",
          valor: 40_000,
          contaId: "conta-fora",
        }),
      ]),
    );
    expect(projection.pontos.at(-1)?.saldo).toBe(100_000);
  });

  it("estimativas ligadas e desligadas mudam o cenário", () => {
    const eventos = [
      evento({ data: "2026-12-10", tipo: "saida", valor: 40_000 }),
      evento({
        data: "2026-12-20",
        tipo: "entrada",
        valor: 80_000,
        certeza: "estimado",
      }),
    ];
    const com = construirProjecao(input(eventos));
    const sem = construirProjecao(input(eventos, { incluirEstimativas: false }));
    expect(com.pontos.at(-1)?.saldo).toBe(140_000);
    expect(sem.pontos.at(-1)?.saldo).toBe(60_000);
  });

  it("simulação identifica novo período e maior profundidade", () => {
    const base = construirProjecao(input([]));
    const rascunho = {
      descricao: "Compra",
      eventos: [
        evento({ data: "2026-12-05", tipo: "saida", valor: 150_000 }),
      ],
    };
    const result = simular(base, rascunho);
    expect(result.novosPeriodos).toHaveLength(1);
    expect(result.aumentouProfundidade).toBe(true);
    expect(result.depois.pontos.at(-1)?.saldo).toBe(-50_000);
  });

  it("parcela máxima segura mantém margem e R$ 0,01 a mais não mantém", () => {
    const base = construirProjecao(
      input([evento({ data: "2026-12-05", tipo: "entrada", valor: 300_000 })], {
        margem: 0,
      }),
    );
    const criar = (valorParcela: number): ForecastEvent[] =>
      Array.from({ length: 6 }, (_, index) =>
        evento({
          id: `safe-${valorParcela}-${index}`,
          data: `2027-0${index + 1}-05`,
          tipo: "saida",
          valor: valorParcela,
        }),
      );
    const result = parcelaMaximaSegura(base, 0, 6, criar);
    expect(result.valorParcela).toBeGreaterThan(0);
    const projection = construirProjecao({
      ...base.entrada,
      eventos: [...base.entrada.eventos, ...criar(result.valorParcela)],
    });
    expect(projection.pontos.every((point) => point.saldo >= 0)).toBe(true);
    const above = construirProjecao({
      ...base.entrada,
      eventos: [...base.entrada.eventos, ...criar(result.valorParcela + 1)],
    });
    expect(above.pontos.some((point) => point.saldo < 0)).toBe(true);
  });

  it("resumo mensal marca meses negativos e ignora liberação em entradas", () => {
    const projection = construirProjecao(
      input([
        evento({ data: "2026-12-05", tipo: "saida", valor: 150_000 }),
        evento({
          data: "2026-12-10",
          tipo: "entrada",
          valor: 20_000,
          kind: "liberacao",
        }),
        evento({ data: "2027-01-05", tipo: "entrada", valor: 200_000 }),
      ]),
    );
    const months = resumoMensal(projection);
    const dez = months.find((month) => month.mes === "2026-12")!;
    expect(dez.negativo).toBe(true);
    expect(dez.entradas).toBe(0);
    expect(dez.liberacoes).toBe(20_000);
    expect(months.find((month) => month.mes === "2027-01")?.negativo).toBe(true);
  });

  it("virada de ano e meses curtos funcionam", () => {
    const projection = construirProjecao({
      hoje: "2026-12-20",
      fim: "2027-03-05",
      margem: 0,
      contas: [conta],
      eventos: [evento({ data: "2027-02-28", tipo: "saida", valor: 20_000 })],
      incluirEstimativas: true,
    });
    const months = resumoMensal(projection);
    expect(months.map((month) => month.mes)).toEqual([
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
    expect(projection.pontos.at(-1)?.saldo).toBe(80_000);
  });
});
