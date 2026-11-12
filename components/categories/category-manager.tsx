"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CategoryIcon } from "@/components/category-icon";
import { FormError } from "@/components/form-feedback";
import { PageHeader } from "@/components/page-header";
import { CategoryFormDialog } from "./category-form-dialog";
import { TagManager } from "./tag-manager";
import {
  deleteCategoryAction,
  setCategoryArchivedAction,
} from "@/lib/actions/categories";
import type {
  CategoryWithCount,
  TagWithCount,
} from "@/lib/db/queries/categories";
import type { CategoryType } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<CategoryType, string> = {
  despesa: "Despesas",
  receita: "Receitas",
};

type CategoryRowProps = {
  category: CategoryWithCount;
  depth?: number;
  pending: boolean;
  onEdit: (category: CategoryWithCount) => void;
  onDelete: (category: CategoryWithCount) => void;
  onToggleArchive: (category: CategoryWithCount) => void;
};

function CategoryRow({
  category,
  depth = 0,
  pending,
  onEdit,
  onDelete,
  onToggleArchive,
}: CategoryRowProps) {
  return (
    <div
      className={cn(
        "flex min-h-14 items-center gap-3 px-3 py-2",
        depth > 0 && "pl-5",
      )}
    >
      <CategoryIcon
        id={category.id}
        icon={category.icone}
        color={category.cor}
        className="h-9 w-9"
        iconClassName="h-4 w-4"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{category.nome}</span>
          {category.isSystem && <Badge variant="secondary">Sistema</Badge>}
          {category.deletedAt && <Badge variant="secondary">Arquivada</Badge>}
          {category.childrenCount > 0 && (
            <Badge variant="outline">
              {category.childrenCount} subcategoria(s)
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {category.transactionCount} lançamento(s)
        </p>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label={`Ações da categoria ${category.nome}`}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreHorizontal className="h-4 w-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(category)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          {!category.isSystem && (
            <>
              <DropdownMenuItem onSelect={() => onToggleArchive(category)}>
                {category.deletedAt ? (
                  <>
                    <ArchiveRestore />
                    Desarquivar
                  </>
                ) : (
                  <>
                    <Archive />
                    Arquivar
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(category)}
              >
                <Trash2 />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CategoryManager({
  categories,
  tags,
}: {
  categories: CategoryWithCount[];
  tags: TagWithCount[];
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CategoryWithCount | null>(null);
  const [defaultType, setDefaultType] = useState<CategoryType>("despesa");
  const [deleting, setDeleting] = useState<CategoryWithCount | null>(null);
  const [moveToId, setMoveToId] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const visible = useMemo(
    () => categories.filter((category) => showArchived || !category.deletedAt),
    [categories, showArchived],
  );

  const rootsByType = useMemo(() => {
    const map: Record<CategoryType, CategoryWithCount[]> = {
      despesa: [],
      receita: [],
    };
    for (const category of visible) {
      if (!category.categoriaPaiId) map[category.tipo].push(category);
    }
    return map;
  }, [visible]);

  function childrenOf(parentId: string) {
    return visible.filter((category) => category.categoriaPaiId === parentId);
  }

  const moveTargets = deleting
    ? categories
        .filter(
          (category) =>
            category.tipo === deleting.tipo &&
            !category.deletedAt &&
            category.id !== deleting.id &&
            category.categoriaPaiId !== deleting.id,
        )
        .sort((a, b) => Number(b.isSystem) - Number(a.isSystem))
    : [];

  function openNew(type: CategoryType) {
    setDefaultType(type);
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(category: CategoryWithCount) {
    setEditing(category);
    setFormOpen(true);
  }

  async function toggleArchive(category: CategoryWithCount) {
    setPendingId(category.id);
    setFlash(null);
    const result = await setCategoryArchivedAction(
      category.id,
      !category.deletedAt,
    );
    setPendingId(null);

    if (!result.ok) {
      setFlash(result.error);
      return;
    }
    router.refresh();
  }

  function openDelete(category: CategoryWithCount) {
    setDeleteError(null);
    setMoveToId("");
    setDeleting(category);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);

    if (deleting.childrenCount > 0) {
      setDeleteError(
        "Esta categoria possui subcategorias. Exclua ou mova as subcategorias primeiro.",
      );
      return;
    }

    if (deleting.transactionCount > 0 && !moveToId) {
      setDeleteError("Escolha uma categoria para receber os lançamentos.");
      return;
    }

    setPendingId(deleting.id);
    const result = await deleteCategoryAction({
      id: deleting.id,
      moveToId: deleting.transactionCount > 0 ? moveToId : null,
    });
    setPendingId(null);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorias e tags"
        description="Organize despesas e receitas, crie subcategorias e gerencie as tags dos lançamentos."
        action={
          <Button asChild variant="outline">
            <Link href="/configuracoes">
              <ArrowLeft className="h-4 w-4" />
              Configurações
            </Link>
          </Button>
        }
      />

      <FormError message={flash} />

      <div className="flex items-center gap-2">
        <Checkbox
          id="show-archived"
          checked={showArchived}
          onCheckedChange={(checked) => setShowArchived(checked === true)}
        />
        <Label htmlFor="show-archived" className="cursor-pointer font-normal">
          Mostrar categorias arquivadas
        </Label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(["despesa", "receita"] as const).map((type) => (
          <Card key={type}>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle>{TYPE_LABELS[type]}</CardTitle>
                <CardDescription>
                  {type === "despesa"
                    ? "Para onde o dinheiro sai."
                    : "De onde o dinheiro entra."}
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openNew(type)}
              >
                <Plus className="h-4 w-4" />
                Nova
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              {rootsByType[type].length === 0 ? (
                <p className="px-5 py-6 text-sm text-muted-foreground">
                  Nenhuma categoria de {type === "despesa" ? "despesa" : "receita"}.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {rootsByType[type].map((root) => {
                    const children = childrenOf(root.id);
                    return (
                      <div key={root.id}>
                        <CategoryRow
                          category={root}
                          pending={pendingId === root.id}
                          onEdit={openEdit}
                          onDelete={openDelete}
                          onToggleArchive={(category) =>
                            void toggleArchive(category)
                          }
                        />
                        {children.length > 0 && (
                          <div className="ml-6 border-l border-border/70 pl-2">
                            {children.map((child) => (
                              <CategoryRow
                                key={child.id}
                                category={child}
                                depth={1}
                                pending={pendingId === child.id}
                                onEdit={openEdit}
                                onDelete={openDelete}
                                onToggleArchive={(category) =>
                                  void toggleArchive(category)
                                }
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Tags className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Tags</CardTitle>
            <CardDescription>
              Marcadores livres para filtrar lançamentos. Excluir uma tag não
              apaga os lançamentos.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <TagManager tags={tags} />
        </CardContent>
      </Card>

      <CategoryFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        categories={categories}
        defaultType={defaultType}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir categoria</DialogTitle>
            <DialogDescription>
              {deleting?.transactionCount
                ? `A categoria "${deleting.nome}" possui ${deleting.transactionCount} lançamento(s). Escolha para onde movê-los antes de excluir.`
                : `Tem certeza que deseja excluir "${deleting?.nome}"?`}
            </DialogDescription>
          </DialogHeader>

          <FormError message={deleteError} />

          {deleting && deleting.transactionCount > 0 && (
            <div className="space-y-2">
              <Label htmlFor="move-category">Mover lançamentos para</Label>
              <NativeSelect
                id="move-category"
                value={moveToId}
                onChange={(event) => setMoveToId(event.target.value)}
              >
                <option value="">Selecione uma categoria</option>
                {moveTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.nome}
                    {target.isSystem ? " (sugerido)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          {deleting && deleting.childrenCount > 0 && (
            <p className="text-sm text-destructive">
              Esta categoria possui {deleting.childrenCount} subcategoria(s).
              Exclua ou mova as subcategorias primeiro.
            </p>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={Boolean(pendingId)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={
                Boolean(pendingId) ||
                (deleting?.childrenCount ?? 0) > 0 ||
                ((deleting?.transactionCount ?? 0) > 0 && !moveToId)
              }
            >
              {pendingId && <Loader2 className="h-4 w-4 animate-spin" />}
              {deleting && deleting.transactionCount > 0
                ? "Mover e excluir"
                : "Excluir categoria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
