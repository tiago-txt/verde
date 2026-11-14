import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import { construirProjecao } from "./forecast";

const conta = {
  id: "conta",
  nome: "Conta",
  tipo: "corrente" as const,
  cor: "#34d399",
  icone: "Wallet",
  saldoAtual: 0,
};

function projetar(fim: string) {
  return construirProjecao({
    hoje: "2026-11-13",
    fim,
    margem: 0,
    contas: [conta],
    eventos: [
      {
        id: "nov-2026",
        data: "2026-11-20",
        tipo: "saida",
        valor: 10_000,
        contaId: "conta",
        kind: "transacao",
        certeza: "certo",
        descricao: "Despesa de novembro",
      },
      {
        id: "dez-2026",
        data: "2026-12-10",
        tipo: "saida",
        valor: 20_000,
        contaId: "conta",
        kind: "transacao",
        certeza: "certo",
        descricao: "Despesa de dezembro",
      },
      {
        id: "nov-2027",
        data: "2027-11-30",
        tipo: "entrada",
        valor: 30_000,
        contaId: "conta",
        kind: "transacao",
        certeza: "certo",
        descricao: "Receita de novembro de 2027",
      },
      {
        id: "dez-2027",
        data: "2027-12-01",
        tipo: "entrada",
        valor: 40_000,
        contaId: "conta",
        kind: "transacao",
        certeza: "certo",
        descricao: "Fora do corte",
      },
    ],
    incluirEstimativas: true,
  });
}

describe("corte da previsão no último dia do mês", () => {
  it("novembro/2026 usa 30/11/2026 e ignora dezembro", () => {
    const fim = monthRange("2026-11").end;
    expect(fim).toBe("2026-11-30");
    const projection = projetar(fim);
    expect(projection.pontos.at(-1)?.saldo).toBe(-10_000);
  });

  it("novembro/2027 usa 30/11/2027, não todos os lançamentos", () => {
    const fim = monthRange("2027-11").end;
    expect(fim).toBe("2027-11-30");
    const projection = projetar(fim);
    // −100 −200 +300; a receita de 01/12/2027 fica fora do corte.
    expect(projection.pontos.at(-1)?.saldo).toBe(0);
  });
});
