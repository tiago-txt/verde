import { addDaysISO, addMonths, monthRange, rangeBetween } from "@/lib/dates";

export const FORECAST_HORIZONS = [6, 12, 24] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

export type ForecastCertainty = "certo" | "estimado";
export type ForecastEventKind =
  | "transacao"
  | "recorrencia"
  | "fatura"
  | "reserva"
  | "liberacao";

export type ForecastEvent = {
  id: string;
  data: string;
  /** entrada/saida movimentam uma conta; transferencia move origem→destino. */
  tipo: "entrada" | "saida" | "transferencia";
  valor: number;
  contaId: string | null;
  contaDestinoId?: string | null;
  kind: ForecastEventKind;
  certeza: ForecastCertainty;
  descricao: string;
  cartaoId?: string | null;
  cartaoNome?: string | null;
  faturaChave?: string | null;
  budgetId?: string | null;
  budgetNome?: string | null;
  budgetCiclo?: string | null;
  recorrenciaId?: string | null;
  parcelaGrupoId?: string | null;
  parcelaAtual?: number | null;
  parcelaTotal?: number | null;
  categoriaId?: string | null;
};

export type ForecastAccount = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "dinheiro" | "investimento";
  cor: string;
  icone: string;
  saldoAtual: number;
  arquivada?: boolean;
};

export type ForecastInput = {
  hoje: string;
  fim: string;
  margem: number;
  contas: ForecastAccount[];
  eventos: ForecastEvent[];
  incluirEstimativas: boolean;
};

export type ForecastPoint = {
  data: string;
  saldo: number;
  porConta: Record<string, number>;
};

export type ForecastProjection = {
  entrada: ForecastInput;
  saldoInicial: number;
  fim: string;
  margem: number;
  eventos: ForecastEvent[];
  pontos: ForecastPoint[];
};

export type ForecastPeriod = {
  inicio: string;
  fim: string;
  menorSaldo: number;
  menorData: string;
  semRecuperacao: boolean;
  eventos: ForecastEvent[];
};

export type ForecastRecovery = {
  data: string;
  evento: ForecastEvent;
};

export type ForecastCause = {
  chave: string;
  label: string;
  valor: number;
  eventos: ForecastEvent[];
};

export type ForecastMonth = {
  mes: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  liberacoes: number;
  saldoFinal: number;
  minimo: number;
  negativo: boolean;
};

export type ForecastDraft = {
  descricao: string;
  eventos: ForecastEvent[];
};

export type ForecastSimulation = {
  antes: ForecastProjection;
  depois: ForecastProjection;
  periodosAntes: ForecastPeriod[];
  periodosDepois: ForecastPeriod[];
  novosPeriodos: ForecastPeriod[];
  aumentouProfundidade: boolean;
  recuperacaoAntes: ForecastRecovery | null;
  recuperacaoDepois: ForecastRecovery | null;
  mudouRecuperacao: boolean;
};

function idsDasContas(contas: ForecastAccount[]): Set<string> {
  return new Set(contas.map((conta) => conta.id));
}

/** Impacto do evento no total das contas selecionadas. */
export function impactoNoTotal(
  event: ForecastEvent,
  contas: Iterable<string>,
): number {
  const selected = contas instanceof Set ? contas : new Set(contas);
  if (event.tipo === "transferencia") {
    let delta = 0;
    if (event.contaId && selected.has(event.contaId)) delta -= event.valor;
    if (event.contaDestinoId && selected.has(event.contaDestinoId)) {
      delta += event.valor;
    }
    return delta;
  }

  const delta = event.tipo === "entrada" ? event.valor : -event.valor;
  if (!event.contaId) return delta;
  return selected.has(event.contaId) ? delta : 0;
}

function aplicarEvento(
  event: ForecastEvent,
  porConta: Record<string, number>,
  selected: Set<string>,
): number {
  let semConta = 0;

  if (event.tipo === "transferencia") {
    if (event.contaId && selected.has(event.contaId)) {
      porConta[event.contaId] = (porConta[event.contaId] ?? 0) - event.valor;
    }
    if (event.contaDestinoId && selected.has(event.contaDestinoId)) {
      porConta[event.contaDestinoId] =
        (porConta[event.contaDestinoId] ?? 0) + event.valor;
    }
    return semConta;
  }

  const delta = event.tipo === "entrada" ? event.valor : -event.valor;
  if (!event.contaId) {
    semConta += delta;
  } else if (selected.has(event.contaId)) {
    porConta[event.contaId] = (porConta[event.contaId] ?? 0) + delta;
  }
  return semConta;
}

function somaContas(porConta: Record<string, number>): number {
  return Object.values(porConta).reduce((sum, value) => sum + value, 0);
}

/** Normaliza atrasados para hoje e remove eventos fora do horizonte. */
export function normalizarEventos(
  eventos: ForecastEvent[],
  hoje: string,
  fim: string,
): ForecastEvent[] {
  return eventos
    .filter((event) => event.data <= fim)
    .map((event) => ({
      ...event,
      data: event.data < hoje ? hoje : event.data,
    }))
    .sort(
      (a, b) =>
        a.data.localeCompare(b.data) ||
        a.descricao.localeCompare(b.descricao) ||
        a.id.localeCompare(b.id),
    );
}

/**
 * Série de saldo projetado. O primeiro ponto é sempre o saldo atual; eventos
 * do próprio dia são aplicados em um segundo ponto na mesma data.
 */
export function construirProjecao(input: ForecastInput): ForecastProjection {
  const selected = idsDasContas(input.contas);
  const eventos = normalizarEventos(
    input.incluirEstimativas
      ? input.eventos
      : input.eventos.filter((event) => event.certeza === "certo"),
    input.hoje,
    input.fim,
  );

  const porConta: Record<string, number> = {};
  for (const conta of input.contas) {
    porConta[conta.id] = conta.saldoAtual;
  }
  const saldoInicial = somaContas(porConta);
  let semConta = 0;

  const dates = new Set<string>([input.hoje, input.fim]);
  for (const event of eventos) dates.add(event.data);
  const lastMonth = input.fim.slice(0, 7);
  for (
    let month = input.hoje.slice(0, 7);
    month <= lastMonth;
    month = addMonths(month, 1)
  ) {
    const end = monthRange(month).end;
    if (end >= input.hoje && end <= input.fim) dates.add(end);
  }

  const orderedDates = [...dates].sort();
  const pontos: ForecastPoint[] = [];
  let eventIndex = 0;
  let pushedInitial = false;

  for (const day of orderedDates) {
    if (!pushedInitial) {
      pontos.push({
        data: input.hoje,
        saldo: somaContas(porConta) + semConta,
        porConta: { ...porConta },
      });
      pushedInitial = true;
    }

    let applied = false;
    while (
      eventIndex < eventos.length &&
      (eventos[eventIndex] as ForecastEvent).data <= day
    ) {
      const event = eventos[eventIndex] as ForecastEvent;
      semConta += aplicarEvento(event, porConta, selected);
      eventIndex += 1;
      applied = true;
    }

    if (day !== input.hoje || applied) {
      pontos.push({
        data: day,
        saldo: somaContas(porConta) + semConta,
        porConta: { ...porConta },
      });
    }
  }

  if (pontos.length === 0) {
    pontos.push({
      data: input.hoje,
      saldo: saldoInicial,
      porConta: { ...porConta },
    });
  }

  return {
    entrada: input,
    saldoInicial,
    fim: input.fim,
    margem: input.margem,
    eventos,
    pontos,
  };
}

/** Períodos em que o saldo fica abaixo da margem. */
export function detectarPeriodosNegativos(
  projection: ForecastProjection,
  margem = projection.margem,
): ForecastPeriod[] {
  const periods: ForecastPeriod[] = [];
  let current: ForecastPoint[] = [];

  function close() {
    if (current.length === 0) return;
    const menor = current.reduce((min, point) =>
      point.saldo < min.saldo ? point : min,
    );
    const first = current[0] as ForecastPoint;
    const last = current[current.length - 1] as ForecastPoint;
    const fim = last.data === projection.fim ? projection.fim : last.data;
    periods.push({
      inicio: first.data,
      fim,
      menorSaldo: menor.saldo,
      menorData: menor.data,
      semRecuperacao: fim === projection.fim,
      eventos: projection.eventos.filter(
        (event) => event.data >= first.data && event.data <= fim,
      ),
    });
    current = [];
  }

  for (const point of projection.pontos) {
    if (point.saldo < margem) current.push(point);
    else close();
  }
  close();

  return periods;
}

function podeSerCausaDeRecuperacao(event: ForecastEvent): boolean {
  return (
    (event.kind === "transacao" || event.kind === "recorrencia") &&
    event.tipo === "entrada"
  );
}

/** Primeira entrada real/recorrência que devolve o saldo para ≥ margem. */
export function encontrarRecuperacao(
  projection: ForecastProjection,
  period: ForecastPeriod,
  margem = projection.margem,
): ForecastRecovery | null {
  const selected = idsDasContas(projection.entrada.contas);
  for (const point of projection.pontos) {
    if (point.data < period.inicio || point.saldo < margem) continue;
    const candidates = projection.eventos.filter(
      (event) =>
        event.data === point.data &&
        podeSerCausaDeRecuperacao(event) &&
        impactoNoTotal(event, selected) > 0,
    );
    if (candidates.length === 0) continue;
    const evento = candidates.reduce((best, event) =>
      impactoNoTotal(event, selected) > impactoNoTotal(best, selected)
        ? event
        : best,
    );
    return { data: point.data, evento };
  }
  return null;
}

/** Agrupa os eventos negativos que explicam o período. */
export function causasDoPeriodo(
  projection: ForecastProjection,
  period: ForecastPeriod,
): ForecastCause[] {
  const selected = idsDasContas(projection.entrada.contas);
  const groups = new Map<
    string,
    { label: string; valor: number; eventos: ForecastEvent[] }
  >();

  for (const event of period.eventos) {
    const impact = impactoNoTotal(event, selected);
    if (impact >= 0) continue;

    let chave: string;
    let label: string;
    if (event.parcelaGrupoId) {
      chave = `parcela:${event.parcelaGrupoId}`;
      label = `Parcelas da ${event.descricao}`;
    } else if (event.recorrenciaId) {
      chave = `recorrencia:${event.recorrenciaId}`;
      label = `Recorrência ${event.descricao}`;
    } else if (event.kind === "fatura") {
      chave = `fatura:${event.cartaoId ?? event.id}:${event.faturaChave ?? ""}`;
      label = `Fatura ${event.cartaoNome ?? event.descricao}`;
    } else if (event.budgetId) {
      chave = `orcamento:${event.budgetId}`;
      label = `Reserva ${event.budgetNome ?? event.descricao}`;
    } else {
      chave = `evento:${event.id}`;
      label = event.descricao;
    }

    const group = groups.get(chave) ?? { label, valor: 0, eventos: [] };
    group.valor += Math.abs(impact);
    group.eventos.push(event);
    groups.set(chave, group);
  }

  for (const group of groups.values()) {
    if (!group.label.startsWith("Parcelas da ")) continue;
    const parcelas = group.eventos
      .map((event) => event.parcelaAtual)
      .filter((value): value is number => typeof value === "number");
    const total = group.eventos.find((event) => event.parcelaTotal)?.parcelaTotal;
    if (parcelas.length > 0 && total) {
      const min = Math.min(...parcelas);
      const max = Math.max(...parcelas);
      group.label = `Parcelas da ${group.eventos[0]?.descricao ?? ""} ${min}/${total} a ${max}/${total}`;
    }
  }

  return [...groups.entries()]
    .map(([chave, group]) => ({ chave, ...group }))
    .sort((a, b) => b.valor - a.valor);
}

function saldoAntesDe(
  projection: ForecastProjection,
  data: string,
): number {
  let saldo = projection.saldoInicial;
  for (const point of projection.pontos) {
    if (point.data >= data) break;
    saldo = point.saldo;
  }
  return saldo;
}

/** Resumo mês a mês. Liberações não entram como entradas. */
export function resumoMensal(
  projection: ForecastProjection,
  margem = projection.margem,
): ForecastMonth[] {
  const selected = idsDasContas(projection.entrada.contas);
  const months: ForecastMonth[] = [];
  const lastMonth = projection.fim.slice(0, 7);

  for (
    let month = projection.entrada.hoje.slice(0, 7);
    month <= lastMonth;
    month = addMonths(month, 1)
  ) {
    const range = monthRange(month);
    const start = range.start < projection.entrada.hoje
      ? projection.entrada.hoje
      : range.start;
    const end = range.end > projection.fim ? projection.fim : range.end;
    if (start > end) continue;

    const saldoInicial = saldoAntesDe(projection, start);
    const points = projection.pontos.filter(
      (point) => point.data >= start && point.data <= end,
    );
    const saldoFinal = points.at(-1)?.saldo ?? saldoInicial;
    const minimo = points.reduce(
      (min, point) => Math.min(min, point.saldo),
      saldoInicial,
    );

    let entradas = 0;
    let saidas = 0;
    let liberacoes = 0;
    for (const event of projection.eventos) {
      if (event.data < start || event.data > end) continue;
      const impact = impactoNoTotal(event, selected);
      if (event.kind === "liberacao") {
        liberacoes += Math.max(0, impact);
        continue;
      }
      if (impact > 0) entradas += impact;
      else if (impact < 0) saidas += Math.abs(impact);
    }

    months.push({
      mes: month,
      saldoInicial,
      entradas,
      saidas,
      liberacoes,
      saldoFinal,
      minimo,
      negativo: minimo < margem,
    });
  }

  return months;
}

/** Simulação antes/depois, sem persistir nada. */
export function simular(
  base: ForecastProjection,
  rascunho: ForecastDraft,
): ForecastSimulation {
  const depois = construirProjecao({
    ...base.entrada,
    eventos: [...base.entrada.eventos, ...rascunho.eventos],
  });
  const periodosAntes = detectarPeriodosNegativos(base);
  const periodosDepois = detectarPeriodosNegativos(depois);
  const antesStarts = new Set(periodosAntes.map((period) => period.inicio));
  const novosPeriodos = periodosDepois.filter(
    (period) => !antesStarts.has(period.inicio),
  );
  const menorAntes = Math.min(...base.pontos.map((point) => point.saldo));
  const menorDepois = Math.min(...depois.pontos.map((point) => point.saldo));
  const recuperacaoAntes = periodosAntes[0]
    ? encontrarRecuperacao(base, periodosAntes[0])
    : null;
  const recuperacaoDepois = periodosDepois[0]
    ? encontrarRecuperacao(depois, periodosDepois[0])
    : null;

  return {
    antes: base,
    depois,
    periodosAntes,
    periodosDepois,
    novosPeriodos,
    aumentouProfundidade: menorDepois < menorAntes,
    recuperacaoAntes,
    recuperacaoDepois,
    mudouRecuperacao:
      recuperacaoAntes?.data !== recuperacaoDepois?.data ||
      recuperacaoAntes?.evento.id !== recuperacaoDepois?.evento.id,
  };
}

/**
 * Maior valor por parcela que mantém toda a série ≥ margem.
 * `criarEventos` recebe o valor em centavos e devolve os eventos do rascunho.
 */
export function parcelaMaximaSegura(
  base: ForecastProjection,
  margem: number,
  parcelas: number,
  criarEventos: (valorParcela: number) => ForecastEvent[],
): { valorParcela: number; parcelas: number; valorTotal: number } {
  const count = Math.max(1, Math.trunc(parcelas));
  const baseJaNegativa = base.pontos.some((point) => point.saldo < margem);
  if (baseJaNegativa) {
    return { valorParcela: 0, parcelas: count, valorTotal: 0 };
  }

  function seguro(valor: number): boolean {
    const projection = construirProjecao({
      ...base.entrada,
      eventos: [...base.entrada.eventos, ...criarEventos(valor)],
    });
    return projection.pontos.every((point) => point.saldo >= margem);
  }

  let low = 0;
  let high = 100_000_000; // R$ 1.000.000,00 em centavos
  for (let i = 0; i < 30; i += 1) {
    const mid = Math.floor((low + high) / 2);
    if (seguro(mid)) low = mid;
    else high = mid;
  }

  const valorParcela = seguro(low) ? low : 0;
  return {
    valorParcela,
    parcelas: count,
    valorTotal: valorParcela * count,
  };
}

/** Menor saldo e data da série. */
export function menorSaldoDaSerie(projection: ForecastProjection): {
  saldo: number;
  data: string;
} {
  return projection.pontos.reduce(
    (min, point) => (point.saldo < min.saldo ? point : min),
    projection.pontos[0] ?? {
      data: projection.entrada.hoje,
      saldo: projection.saldoInicial,
      porConta: {},
    },
  );
}

/** Atalho para o horizonte em meses a partir de hoje. */
export function fimDoHorizonte(hoje: string, meses: number): string {
  const end = addMonths(hoje.slice(0, 7), meses);
  return addDaysISO(monthRange(end).end, 0);
}

export function diasDoHorizonte(hoje: string, meses: number): string[] {
  return rangeBetween(hoje, fimDoHorizonte(hoje, meses));
}
