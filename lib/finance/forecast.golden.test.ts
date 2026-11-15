// Congela o comportamento aprovado pelo dono; não editar para passar.
import { describe, expect, it } from "vitest";
import {
  construirProjecao,
  detectarPeriodosNegativos,
  encontrarRecuperacao,
  type ForecastEvent,
} from "./forecast";

const HOJE = "2026-11-15";
const FIM = "2026-12-31";
const CONTA = "conta-1";

const ACCOUNT = {
  id: CONTA,
  nome: "Conta",
  tipo: "corrente" as const,
  cor: "#34d399",
  icone: "Wallet",
  saldoAtual: 10_000,
};

const SAIDA_CERTA: ForecastEvent = {
  id: "tx-saida",
  data: "2026-11-20",
  tipo: "saida",
  valor: 15_000,
  contaId: CONTA,
  kind: "transacao",
  certeza: "certo",
  descricao: "Despesa certa",
};

const ENTRADA_ESTIMADA: ForecastEvent = {
  id: "rec-entrada",
  data: "2026-12-01",
  tipo: "entrada",
  valor: 10_000,
  contaId: CONTA,
  kind: "recorrencia",
  certeza: "estimado",
  descricao: "Receita estimada",
};

function projetar(incluirEstimativas: boolean) {
  return construirProjecao({
    hoje: HOJE,
    fim: FIM,
    margem: 0,
    contas: [ACCOUNT],
    eventos: [SAIDA_CERTA, ENTRADA_ESTIMADA],
    incluirEstimativas,
  });
}

describe("previsão: estimativas ligadas e desligadas", () => {
  it("com estimativas, a entrada estimada recupera o saldo", () => {
    const projection = projetar(true);
    expect(projection.saldoInicial).toBe(10_000);
    expect(projection.pontos.at(-1)?.saldo).toBe(5_000);

    const periodos = detectarPeriodosNegativos(projection);
    expect(periodos).toHaveLength(1);
    expect(periodos[0]).toMatchObject({
      inicio: "2026-11-20",
      fim: "2026-11-30",
      menorSaldo: -5_000,
      menorData: "2026-11-20",
      semRecuperacao: false,
    });

    const recuperacao = encontrarRecuperacao(projection, periodos[0]!);
    expect(recuperacao?.data).toBe("2026-12-01");
    expect(recuperacao?.evento.descricao).toBe("Receita estimada");
  });

  it("sem estimativas, o período negativo segue até o fim", () => {
    const projection = projetar(false);
    expect(projection.pontos.at(-1)?.saldo).toBe(-5_000);

    const periodos = detectarPeriodosNegativos(projection);
    expect(periodos).toHaveLength(1);
    expect(periodos[0]).toMatchObject({
      inicio: "2026-11-20",
      fim: FIM,
      menorSaldo: -5_000,
      menorData: "2026-11-20",
      semRecuperacao: true,
    });
    expect(encontrarRecuperacao(projection, periodos[0]!)).toBeNull();
  });
});
