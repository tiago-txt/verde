"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCheck,
  Loader2,
  Tags,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FormError } from "@/components/form-feedback";
import { CategoryPicker } from "./category-picker";
import type { TransactionFormData } from "@/lib/db/queries/transactions";

export function BulkActionsBar({
  selectedCount,
  onSelectAll,
  onClearSelection,
  onMarkPaid,
  onMarkUnpaid,
  onCategory,
  onTag,
  onDelete,
  onExit,
}: {
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onMarkPaid: () => void;
  onMarkUnpaid: () => void;
  onCategory: () => void;
  onTag: () => void;
  onDelete: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-2">
      <span className="min-w-20 px-1 text-sm font-medium text-primary">
        {selectedCount} selecionado(s)
      </span>
      <Button type="button" variant="outline" onClick={onSelectAll}>
        <CheckCheck className="h-4 w-4" />
        Todos
      </Button>
      <Button
        type="button"
       
        variant="outline"
        onClick={onClearSelection}
      >
        Limpar
      </Button>
      <Button type="button" variant="outline" onClick={onMarkPaid}>
        <Check className="h-4 w-4" />
        Pago
      </Button>
      <Button type="button" variant="outline" onClick={onMarkUnpaid}>
        <XCircle className="h-4 w-4" />
        Não pago
      </Button>
      <Button type="button" variant="outline" onClick={onCategory}>
        Categoria
      </Button>
      <Button type="button" variant="outline" onClick={onTag}>
        <Tags className="h-4 w-4" />
        Tag
      </Button>
      <Button
        type="button"
       
        variant="outline"
        className="text-destructive hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-4 w-4" />
        Excluir
      </Button>
      <Button
        type="button"
       
        variant="ghost"
        className="ml-auto"
        onClick={onExit}
        aria-label="Sair do modo de seleção"
      >
        <X className="h-4 w-4" />
        Sair
      </Button>
    </div>
  );
}

export function BulkCategoryDialog({
  open,
  onOpenChange,
  categories,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TransactionFormData["categories"];
  onConfirm: (categoryId: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [categoryId, setCategoryId] = useState("");
  useEffect(() => {
    if (!open) setCategoryId("");
  }, [open]);
  const despesas = categories.filter(
    (category) => category.tipo === "despesa" && !category.deletedAt,
  );
  const receitas = categories.filter(
    (category) => category.tipo === "receita" && !category.deletedAt,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar categoria em lote</DialogTitle>
          <DialogDescription>
            Só despesas recebem categoria de despesa e só receitas recebem
            categoria de receita. Transferências são ignoradas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bulk-category">Categoria</Label>
          <NativeSelect
            id="bulk-category"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Selecione</option>
            <optgroup label="Despesas">
              {despesas.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label="Receitas">
              {receitas.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nome}
                </option>
              ))}
            </optgroup>
          </NativeSelect>
        </div>

        <FormError message={error} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => categoryId && onConfirm(categoryId)}
            disabled={!categoryId || pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar categoria
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTagDialog({
  open,
  onOpenChange,
  tags,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TransactionFormData["tags"];
  onConfirm: (tagId: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const [tagId, setTagId] = useState("");
  useEffect(() => {
    if (!open) setTagId("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar tag em lote</DialogTitle>
          <DialogDescription>
            A tag será adicionada a todos os lançamentos selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="bulk-tag">Tag</Label>
          <NativeSelect
            id="bulk-tag"
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
          >
            <option value="">Selecione</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.nome}
              </option>
            ))}
          </NativeSelect>
        </div>

        <FormError message={error} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => tagId && onConfirm(tagId)}
            disabled={!tagId || pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Adicionar tag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  count,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir selecionados</DialogTitle>
          <DialogDescription>
            Excluir {count} lançamento(s)? Em séries recorrentes, apenas as
            ocorrências selecionadas serão removidas.
          </DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuickCategoryDialog({
  open,
  onOpenChange,
  categories,
  tipo,
  currentCategoryId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: TransactionFormData["categories"];
  tipo: "despesa" | "receita";
  currentCategoryId: string | null;
  onConfirm: (categoryId: string) => void;
}) {
  const options = categories.filter(
    (category) =>
      !category.deletedAt ||
      category.id === currentCategoryId,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--verde-sheet-max-h,92dvh)] overflow-y-auto p-4 sm:max-w-lg">
        <DialogHeader className="pr-10">
          <DialogTitle>Trocar categoria</DialogTitle>
          <DialogDescription>
            Escolha a nova categoria deste lançamento.
          </DialogDescription>
        </DialogHeader>
        <CategoryPicker
          options={options.filter((category) => category.tipo === tipo)}
          value={currentCategoryId}
          autoFocusSearch={false}
          onChange={(categoryId) => {
            if (categoryId) onConfirm(categoryId);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
