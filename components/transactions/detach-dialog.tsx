"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Scissors, Trash2 } from "lucide-react";
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
import { formatDate } from "@/lib/format";

export type DetachMode = "split" | "only";

type DetachDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionListItem | null;
  onSelect: (mode: DetachMode) => void;
};

export function DetachDialog({
  open,
  onOpenChange,
  transaction,
  onSelect,
}: DetachDialogProps) {
  const [choice, setChoice] = useState<DetachMode | null>(null);

  useEffect(() => {
    if (!open) setChoice(null);
  }, [open]);

  if (!transaction) return null;

  const isInstallment =
    Boolean(transaction.parcelaGrupoId) &&
    (transaction.parcelaTotal ?? 0) > 1;
  const previous = isInstallment
    ? Math.max((transaction.parcelaAtual ?? 1) - 1, 0)
    : 0;
  const next = isInstallment
    ? Math.max(
        (transaction.parcelaTotal ?? 1) - (transaction.parcelaAtual ?? 1),
        0,
      )
    : 0;

  const splitDescription = isInstallment
    ? previous > 0 && next > 0
      ? `As ${previous} parcelas anteriores continuam como ${previous} parcelas; esta vira avulsa; as ${next} seguintes viram uma nova série de ${next} parcelas.`
      : previous > 0
        ? `As ${previous} parcelas anteriores continuam como ${previous} parcelas; esta vira avulsa.`
        : next > 0
          ? `Esta vira avulsa; as ${next} parcelas seguintes viram uma nova série de ${next} parcelas.`
          : "Esta parcela vira avulsa."
    : "As ocorrências anteriores continuam na série; esta vira avulsa; as próximas começam uma nova série.";

  const onlyDescription = isInstallment
    ? next > 0
      ? `As ${next} parcelas seguintes serão removidas; esta vira avulsa. As ${previous} anteriores ficam como histórico.`
      : "Esta é a última parcela: ela vira avulsa e o parcelamento termina."
    : "As próximas ocorrências serão removidas; esta vira avulsa.";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setChoice(null);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {choice ? "Confirmar separação" : "Tornar avulsa"}
          </DialogTitle>
          <DialogDescription>
            <span className="block font-medium text-foreground">
              {transaction.descricao}
            </span>
            {formatDate(transaction.data)}
            {isInstallment
              ? ` · Parcela ${transaction.parcelaAtual}/${transaction.parcelaTotal}`
              : transaction.recorrenciaId
                ? " · lançamento recorrente"
                : ""}
            {!choice && (
              <span className="mt-2 block">
                Como você quer separar esta ocorrência?
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {choice ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {choice === "split" ? splitDescription : onlyDescription}
            </p>
            <p className="flex items-start gap-2 rounded-md border border-amber/40 bg-amber/10 p-3 text-xs text-amber">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>
                Esta ação reorganiza as parcelas e não pode ser desfeita pela
                interface. Confira antes de continuar.
              </span>
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 w-full items-start justify-start whitespace-normal px-4 py-3 text-left"
              onClick={() => setChoice("split")}
            >
              <Scissors className="h-4 w-4" />
              <span>
                <span className="block font-medium">
                  Separar esta ocorrência
                </span>
                <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                  {splitDescription}
                </span>
              </span>
            </Button>

            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-14 w-full items-start justify-start whitespace-normal px-4 py-3 text-left"
              onClick={() => setChoice("only")}
            >
              <Trash2 className="h-4 w-4" />
              <span>
                <span className="block font-medium">
                  Manter só esta ocorrência
                </span>
                <span className="block whitespace-normal text-xs font-normal text-muted-foreground">
                  {onlyDescription}
                </span>
              </span>
            </Button>
          </div>
        )}

        <DialogFooter>
          {choice ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setChoice(null)}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant={choice === "only" ? "destructive" : "default"}
                onClick={() => onSelect(choice)}
              >
                {choice === "only" ? (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Remover e tornar avulsa
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    Confirmar separação
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
