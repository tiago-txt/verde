"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { getCardById } from "@/lib/db/queries/cards";
import { listAllCategories } from "@/lib/db/queries/categories";
import {
  invalidateForecastCache,
  saveForecastPreferences,
  simulateForecast,
  type ForecastDraftInput,
} from "@/lib/db/queries/forecast";
import { causasDoPeriodo, encontrarRecuperacao } from "@/lib/finance/forecast";
import { idSchema, isoDateSchema } from "@/lib/validation/common";

export type ForecastActionResult = { ok: true } | { ok: false; error: string };

const prefsSchema = z.object({
  horizonte: z.union([z.literal(6), z.literal(12), z.literal(24)]),
  margem: z
    .number()
    .int("Margem inválida")
    .min(0, "A margem não pode ser negativa"),
  contas: z.array(idSchema).min(1, "Escolha pelo menos uma conta"),
  incluirEstimativas: z.boolean(),
});

export async function saveForecastPreferencesAction(input: {
  horizonte: number;
  margem: number;
  contas: string[];
  incluirEstimativas: boolean;
}): Promise<ForecastActionResult> {
  const user = await requireUser();
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Preferências inválidas.",
    };
  }

  const allowed = new Set(
    listAllAccounts(user.workspaceId)
      .filter((account) => account.tipo !== "investimento")
      .map((account) => account.id),
  );
  if (parsed.data.contas.some((id) => !allowed.has(id))) {
    return { ok: false, error: "Conta inválida para este workspace." };
  }

  saveForecastPreferences(user.workspaceId, user.id, parsed.data);
  revalidatePath("/previsao");
  revalidatePath("/");
  revalidatePath("/lancamentos");
  return { ok: true };
}

const draftSchema = z.object({
  tipo: z.enum(["despesa", "receita", "transferencia"]),
  descricao: z.string().trim().min(1).max(200),
  valor: z.number().int().positive(),
  data: isoDateSchema,
  parcelas: z.number().int().min(1).max(60),
  baseValor: z.enum(["total", "parcela"]),
  contaId: idSchema.nullable(),
  contaDestinoId: idSchema.nullable().optional(),
  cartaoId: idSchema.nullable(),
  categoriaId: idSchema.nullable(),
  orcamentoDeslocamento: z.number().int().min(-2).max(2).optional(),
});

export type ForecastHint = {
  temAlerta: boolean;
  periodo: {
    inicio: string;
    fim: string;
    menorSaldo: number;
    menorData: string;
    semRecuperacao: boolean;
    eventoInicial: {
      descricao: string;
      parcelaAtual: number | null;
      parcelaTotal: number | null;
    } | null;
    recuperacao: {
      data: string;
      descricao: string;
      kind: string;
    } | null;
    causas: { label: string; valor: number }[];
  } | null;
  maxParcela: {
    valorParcela: number;
    parcelas: number;
    valorTotal: number;
  } | null;
};

export async function simulateForecastAction(
  input: ForecastDraftInput,
): Promise<{ ok: true; hint: ForecastHint } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Rascunho inválido.",
    };
  }

  const accounts = new Set(
    listAllAccounts(user.workspaceId).map((account) => account.id),
  );
  for (const accountId of [parsed.data.contaId, parsed.data.contaDestinoId]) {
    if (accountId && !accounts.has(accountId)) {
      return { ok: false, error: "Conta inválida para este workspace." };
    }
  }
  if (
    parsed.data.cartaoId &&
    !getCardById(user.workspaceId, parsed.data.cartaoId)
  ) {
    return { ok: false, error: "Cartão inválido para este workspace." };
  }
  if (
    parsed.data.categoriaId &&
    !listAllCategories(user.workspaceId).some(
      (category) => category.id === parsed.data.categoriaId,
    )
  ) {
    return { ok: false, error: "Categoria inválida para este workspace." };
  }

  const { data, simulation, maxParcela } = simulateForecast(
    user.workspaceId,
    user.id,
    parsed.data,
  );
  const relevante =
    simulation.novosPeriodos.length > 0 ||
    simulation.aumentouProfundidade ||
    simulation.mudouRecuperacao;
  if (!relevante) {
    return {
      ok: true,
      hint: { temAlerta: false, periodo: null, maxParcela: null },
    };
  }

  const period =
    simulation.novosPeriodos[0] ??
    simulation.periodosDepois.reduce<typeof simulation.periodosDepois[number] | null>(
      (worst, current) =>
        !worst || current.menorSaldo < worst.menorSaldo ? current : worst,
      null,
    );
  if (!period) {
    return {
      ok: true,
      hint: { temAlerta: false, periodo: null, maxParcela: null },
    };
  }

  const recuperacao = encontrarRecuperacao(
    simulation.depois,
    period,
    data.prefs.margem,
  );
  const causas = causasDoPeriodo(simulation.depois, period);
  const eventoInicial =
    period.eventos.find((event) => event.data === period.inicio) ??
    period.eventos[0] ??
    null;

  return {
    ok: true,
    hint: {
      temAlerta: true,
      periodo: {
        inicio: period.inicio,
        fim: period.fim,
        menorSaldo: period.menorSaldo,
        menorData: period.menorData,
        semRecuperacao: period.semRecuperacao && !recuperacao,
        eventoInicial: eventoInicial
          ? {
              descricao: eventoInicial.descricao,
              parcelaAtual: eventoInicial.parcelaAtual ?? null,
              parcelaTotal: eventoInicial.parcelaTotal ?? null,
            }
          : null,
        recuperacao: recuperacao
          ? {
              data: recuperacao.data,
              descricao: recuperacao.evento.descricao,
              kind: recuperacao.evento.kind,
            }
          : null,
        causas: causas.map((cause) => ({
          label: cause.label,
          valor: cause.valor,
        })),
      },
      maxParcela,
    },
  };
}
