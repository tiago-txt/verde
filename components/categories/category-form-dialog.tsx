"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toIconName } from "@/lib/icon-names";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { FieldError, FormError } from "@/components/form-feedback";
import type { CategoryWithCount } from "@/lib/db/queries/categories";
import type { CategoryType } from "@/lib/db/schema";
import { DEFAULT_COLOR } from "@/lib/colors";
import {
  categoryInputSchema,
  type CategoryInput,
} from "@/lib/validation/categories";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";

const TYPE_LABELS: Record<CategoryType, string> = {
  despesa: "Despesa",
  receita: "Receita",
};

type CategoryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryWithCount | null;
  categories: CategoryWithCount[];
  defaultType: CategoryType;
  onSaved: () => void;
};

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  categories,
  defaultType,
  onSaved,
}: CategoryFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const form = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema) as Resolver<CategoryInput>,
    defaultValues: {
      nome: category?.nome ?? "",
      tipo: category?.tipo ?? defaultType,
      categoriaPaiId: category?.categoriaPaiId ?? null,
      cor: category?.cor ?? DEFAULT_COLOR,
      icone: toIconName(category?.icone),
    },
  });

  const { register, control, handleSubmit, reset, watch, setValue, formState } =
    form;
  const tipo = watch("tipo");
  const canHaveParent =
    (!category || category.childrenCount === 0) && !category?.isSystem;

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset({
      nome: category?.nome ?? "",
      tipo: category?.tipo ?? defaultType,
      categoriaPaiId: category?.categoriaPaiId ?? null,
      cor: category?.cor ?? DEFAULT_COLOR,
      icone: toIconName(category?.icone),
    });
  }, [open, category, defaultType, reset]);

  const parentOptions = categories.filter(
    (item) =>
      item.tipo === tipo &&
      !item.categoriaPaiId &&
      item.id !== category?.id &&
      (!item.deletedAt || item.id === category?.categoriaPaiId),
  );

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = category
      ? await updateCategoryAction(category.id, values)
      : await createCategoryAction(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {category ? "Editar categoria" : "Nova categoria"}
              {category?.isSystem && (
                <Badge variant="secondary">Sistema</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Categorias ajudam a entender para onde o dinheiro vai. É permitido
              apenas um nível de subcategoria.
            </DialogDescription>
          </DialogHeader>

          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="category-nome">Nome</Label>
            <Input
              id="category-nome"
              placeholder="Ex.: Mercado"
              autoFocus={!isMobile}
              aria-invalid={Boolean(formState.errors.nome)}
              {...register("nome")}
            />
            <FieldError message={formState.errors.nome?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo</Label>
              {category ? (
                <div className="flex h-11 items-center">
                  <Badge variant={tipo === "receita" ? "success" : "destructive"}>
                    {TYPE_LABELS[tipo]}
                  </Badge>
                  <span className="ml-2 text-xs text-muted-foreground">
                    não editável
                  </span>
                </div>
              ) : (
                <Controller
                  control={control}
                  name="tipo"
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value}
                      onChange={(event) => {
                        field.onChange(event.target.value);
                        setValue("categoriaPaiId", null);
                      }}
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </NativeSelect>
                  )}
                />
              )}
              <FieldError message={formState.errors.tipo?.message} />
            </div>

            <div className="space-y-2">
              <Label>Categoria pai</Label>
              {canHaveParent ? (
                <Controller
                  control={control}
                  name="categoriaPaiId"
                  render={({ field }) => (
                    <NativeSelect
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(event.target.value || null)
                      }
                    >
                      <option value="">Sem categoria pai</option>
                      {parentOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.nome}
                          {item.deletedAt ? " (arquivada)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                />
              ) : (
                <div className="flex h-11 items-center rounded-md border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
                  {category?.isSystem
                    ? "Categoria de sistema não pode ter categoria pai."
                    : "Esta categoria tem subcategorias e não pode ter pai."}
                </div>
              )}
              <FieldError message={formState.errors.categoriaPaiId?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <Controller
              control={control}
              name="cor"
              render={({ field }) => (
                <ColorPicker value={field.value} onChange={field.onChange} />
              )}
            />
            <FieldError message={formState.errors.cor?.message} />
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <Controller
              control={control}
              name="icone"
              render={({ field }) => (
                <IconPicker value={field.value} onChange={field.onChange} />
              )}
            />
            <FieldError message={formState.errors.icone?.message} />
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {category ? "Salvar alterações" : "Criar categoria"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
