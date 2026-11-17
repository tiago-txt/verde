export type DuplicateKeyFields = {
  tipo: string;
  data: string;
  valor: number;
  descricao: string;
  contaId: string | null;
  cartaoId: string | null;
  contaDestinoId: string | null;
  faturaChave: string | null;
};

export type DuplicateGroup<T extends DuplicateKeyFields> = {
  key: string;
  tipo: string;
  data: string;
  valor: number;
  descricao: string;
  items: T[];
};

export type RepeatedCandidate = DuplicateKeyFields & {
  id: string;
  recorrenciaId: string | null;
  parcelaGrupoId: string | null;
};

export type RepeatedGroup<T extends RepeatedCandidate> = {
  key: string;
  tipo: string;
  descricao: string;
  items: T[];
};

/**
 * Chave de duplicidade: mesmo tipo, data, valor, descrição e origem.
 * Descrição é comparada sem espaços nas pontas e sem diferenciar maiúsculas.
 */
export function duplicateKey(item: DuplicateKeyFields): string {
  return [
    item.tipo,
    item.data,
    item.valor,
    item.descricao.trim().toLocaleLowerCase("pt-BR"),
    item.contaId ?? "",
    item.cartaoId ?? "",
    item.contaDestinoId ?? "",
    item.faturaChave ?? "",
  ].join("|");
}

export function groupDuplicates<T extends DuplicateKeyFields>(
  items: T[],
): DuplicateGroup<T>[] {
  const groups = new Map<string, DuplicateGroup<T>>();

  for (const item of items) {
    const key = duplicateKey(item);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        tipo: item.tipo,
        data: item.data,
        valor: item.valor,
        descricao: item.descricao,
        items: [item],
      });
    }
  }

  return [...groups.values()]
    .filter((group) => group.items.length > 1)
    .sort(
      (a, b) =>
        b.data.localeCompare(a.data) ||
        a.descricao.localeCompare(b.descricao, "pt-BR"),
    );
}

function repeatedKey(item: DuplicateKeyFields): string {
  return [
    item.tipo,
    item.descricao.trim().toLocaleLowerCase("pt-BR"),
    item.contaId ?? "",
    item.cartaoId ?? "",
    item.contaDestinoId ?? "",
    item.faturaChave ?? "",
  ].join("|");
}

/**
 * Possíveis repetições: mesma descrição e origem em datas diferentes, sem
 * vínculo de recorrência ou parcelamento. Serve para achar séries órfãs
 * criadas por engano; exige ao menos duas datas distintas.
 */
export function groupRepeated<T extends RepeatedCandidate>(
  items: T[],
  excludeIds: Set<string> = new Set(),
): RepeatedGroup<T>[] {
  const groups = new Map<string, RepeatedGroup<T>>();

  for (const item of items) {
    if (excludeIds.has(item.id)) continue;
    if (item.recorrenciaId || item.parcelaGrupoId) continue;

    const key = repeatedKey(item);
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      groups.set(key, {
        key,
        tipo: item.tipo,
        descricao: item.descricao,
        items: [item],
      });
    }
  }

  return [...groups.values()]
    .filter((group) => {
      if (group.items.length < 2) return false;
      return new Set(group.items.map((item) => item.data)).size > 1;
    })
    .sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR"));
}
