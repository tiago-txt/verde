"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, ScanSearch, Trash2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import {
  findDuplicateTransactionsAction,
  type DuplicateGroupView,
  type DuplicateItemView,
  type RepeatedGroupView,
} from "@/lib/actions/duplicates";
import {
  deleteTransactionAction,
  normalizeOrphanInstallmentsAction,
} from "@/lib/actions/transactions";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

function typeLabel(tipo: string): string {
  return tipo === "despesa"
    ? "Despesa"
    : tipo === "receita"
      ? "Receita"
      : "Transferência";
}

function itemMeta(item: DuplicateItemView): string {
  const parts = [item.pago ? "Pago" : "Não pago"];
  if (item.recorrenciaId) parts.push("recorrente");
  if (item.parcelaGrupoId) {
    parts.push(`parcela ${item.parcelaAtual}/${item.parcelaTotal}`);
  }
  parts.push(`criado em ${formatDateTime(new Date(item.createdAt))}`);
  return parts.join(" · ");
}

function ItemActions({
  item,
  onDelete,
}: {
  item: DuplicateItemView;
  onDelete: () => void;
}) {
  return (
    <>
      <Link
        href={`/lancamentos?mes=${item.data.slice(0, 7)}&editar=${item.id}&dias=31`}
        className="shrink-0 text-xs text-primary hover:underline"
      >
        Abrir
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label={`Excluir duplicado ${item.descricao}`}
      >
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>
    </>
  );
}

export function DuplicateFinder() {
  const { toast } = useToast();
  const [exact, setExact] = useState<DuplicateGroupView[]>([]);
  const [repeated, setRepeated] = useState<RepeatedGroupView[]>([]);
  const [scanned, setScanned] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<DuplicateItemView | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [isFixing, startFix] = useTransition();

  function scan() {
    setError(null);
    startTransition(async () => {
      const result = await findDuplicateTransactionsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExact(result.exact);
      setRepeated(result.repeated);
      setScanned(true);
    });
  }

  function fixInstallments() {
    setError(null);
    startFix(async () => {
      const result = await normalizeOrphanInstallmentsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        description:
          result.fixed === 0
            ? "Nenhum parcelamento para corrigir."
            : `${result.fixed} parcelamento(s) corrigido(s).`,
        tone: "success",
      });
      scan();
    });
  }

  function confirmDelete() {
    if (!deleting) return;
    startDelete(async () => {
      const result = await deleteTransactionAction({
        id: deleting.id,
        scope: "single",
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        description: "Lançamento duplicado excluído.",
        tone: "success",
      });
      setDeleting(null);
      const found = await findDuplicateTransactionsAction();
      if (found.ok) {
        setExact(found.exact);
        setRepeated(found.repeated);
      }
    });
  }

  const empty =
    scanned && exact.length === 0 && repeated.length === 0;
  const query = filter.trim().toLocaleLowerCase("pt-BR");
  const matches = (descricao: string) =>
    !query || descricao.toLocaleLowerCase("pt-BR").includes(query);
  const exactFiltered = exact.filter((group) => matches(group.descricao));
  const repeatedFiltered = repeated.filter((group) =>
    matches(group.descricao),
  );
  const filteredEmpty =
    scanned &&
    !empty &&
    exactFiltered.length === 0 &&
    repeatedFiltered.length === 0;

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <span className="tile grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
            <ScanSearch className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Lançamentos duplicados</CardTitle>
            <CardDescription>
              Procura duplicados exatos e séries repetidas sem vínculo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={scan}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="h-4 w-4" />
              )}
              {isPending ? "Procurando…" : "Procurar duplicados"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={fixInstallments}
              disabled={isFixing}
              title="Reenumera parcelas cujo total ficou antigo após exclusões"
            >
              {isFixing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4" />
              )}
              Corrigir parcelamentos
            </Button>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {empty && (
            <p className="text-xs text-muted-foreground">
              Nenhum lançamento duplicado encontrado.
            </p>
          )}

          {(exact.length > 0 || repeated.length > 0) && (
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filtrar por descrição"
              aria-label="Filtrar duplicados por descrição"
            />
          )}

          {filteredEmpty && (
            <p className="text-xs text-muted-foreground">
              Nenhum resultado para este filtro.
            </p>
          )}

          {exactFiltered.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">Duplicados exatos</p>
              {exactFiltered.map((group) => (
                <div
                  key={group.key}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 text-sm font-medium">
                      {group.descricao}
                    </p>
                    <p className="tabular shrink-0 text-sm text-destructive">
                      {formatCurrency(group.valor)}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(group.data)} · {group.items.length} lançamentos
                    iguais
                  </p>

                  <div className="mt-2 divide-y divide-border rounded-md border border-border">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {item.cartaoNome ?? item.contaNome ?? "Sem origem"}
                          </span>
                          <span className="block text-muted-foreground">
                            {itemMeta(item)}
                          </span>
                        </span>
                        <Badge variant="secondary">
                          {typeLabel(item.tipo)}
                        </Badge>
                        <ItemActions
                          item={item}
                          onDelete={() => setDeleting(item)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {repeatedFiltered.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium">
                Possíveis repetições sem vínculo
              </p>
              <p className="text-xs text-muted-foreground">
                Mesma descrição e origem em datas diferentes, sem recorrência
                ou parcelamento. Confira antes de excluir.
              </p>
              {repeatedFiltered.map((group) => (
                <div
                  key={group.key}
                  className="rounded-lg border border-border p-3"
                >
                  <p className="text-sm font-medium">{group.descricao}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.items.length} lançamentos repetidos
                  </p>

                  <div className="mt-2 divide-y divide-border rounded-md border border-border">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center gap-2 px-2 py-2 text-xs"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                            <span className="truncate">
                              {formatDate(item.data)} ·{" "}
                              {item.cartaoNome ??
                                item.contaNome ??
                                "Sem origem"}
                            </span>
                            <span className="tabular shrink-0 text-destructive">
                              {formatCurrency(item.valor)}
                            </span>
                          </span>
                          <span className="block text-muted-foreground">
                            {itemMeta(item)}
                          </span>
                        </span>
                        <Badge variant="secondary">
                          {typeLabel(item.tipo)}
                        </Badge>
                        <ItemActions
                          item={item}
                          onDelete={() => setDeleting(item)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento duplicado?</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  <span className="block font-medium text-foreground">
                    {deleting.descricao}
                  </span>
                  {formatDate(deleting.data)} ·{" "}
                  {formatCurrency(deleting.valor)}
                </>
              )}
              <span className="mt-2 block">
                Esta ação não pode ser desfeita pela interface.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
