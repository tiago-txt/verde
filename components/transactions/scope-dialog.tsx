"use client";

import { Repeat, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TransactionListItem } from "@/lib/db/queries/transactions";
import type { Scope } from "@/lib/finance/scopes";
import { formatDate } from "@/lib/format";

type ScopeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "edit" | "delete";
  transaction: TransactionListItem | null;
  onSelect: (scope: Scope) => void;
};

export function ScopeDialog({
  open,
  onOpenChange,
  mode,
  transaction,
  onSelect,
}: ScopeDialogProps) {
  if (!transaction) return null;

  const isInstallment = Boolean(transaction.parcelaGrupoId);
  const singleLabel = isInstallment ? "Só esta parcela" : "Só este lançamento";
  const futureLabel = isInstallment
    ? "Esta e as próximas parcelas"
    : "Este e os próximos";
  const allLabel = isInstallment ? "Todas as parcelas" : "Todos os lançamentos";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? "Editar lançamento" : "Excluir lançamento"}
          </DialogTitle>
          <DialogDescription>
            <span className="block font-medium text-foreground">
              {transaction.descricao}
            </span>
            {formatDate(transaction.data)}
            {isInstallment
              ? ` · Parcela ${transaction.parcelaAtual}/${transaction.parcelaTotal}`
              : " · lançamento recorrente"}
            <span className="mt-2 block">
              {mode === "edit"
                ? "Escolha o alcance da alteração."
                : "Escolha quais lançamentos serão excluídos. Esta ação não pode ser desfeita pela interface."}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-14 w-full justify-start px-4 py-3 text-left"
            onClick={() => onSelect("single")}
          >
            <Pencil className="h-4 w-4" />
            <span>
              <span className="block font-medium">{singleLabel}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Apenas a ocorrência de {formatDate(transaction.data)}.
              </span>
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-14 w-full justify-start px-4 py-3 text-left"
            onClick={() => onSelect("future")}
          >
            <Repeat className="h-4 w-4" />
            <span>
              <span className="block font-medium">{futureLabel}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                {isInstallment
                  ? "Esta parcela e as seguintes."
                  : "Esta data e todas as ocorrências futuras."}
              </span>
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-14 w-full justify-start px-4 py-3 text-left"
            onClick={() => onSelect("all")}
          >
            <Trash2 className="h-4 w-4" />
            <span>
              <span className="block font-medium">{allLabel}</span>
              <span className="block text-xs font-normal text-muted-foreground">
                Inclui ocorrências passadas.
              </span>
            </span>
          </Button>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
