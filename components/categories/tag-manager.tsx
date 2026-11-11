"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Tag as TagIcon, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { FormError } from "@/components/form-feedback";
import type { TagWithCount } from "@/lib/db/queries/categories";
import {
  createTagAction,
  deleteTagAction,
  renameTagAction,
} from "@/lib/actions/tags";

export function TagManager({ tags }: { tags: TagWithCount[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TagWithCount | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<TagWithCount | null>(null);
  const isMobile = useIsMobile();

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("create");
    const result = await createTagAction({ nome: newName });
    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setNewName("");
    router.refresh();
  }

  async function handleRename() {
    if (!editing) return;
    setError(null);
    setPending("rename");
    const result = await renameTagAction(editing.id, { nome: editName });
    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEditing(null);
    router.refresh();
  }

  async function handleDelete() {
    if (!deleting) return;
    setError(null);
    setPending("delete");
    const result = await deleteTagAction(deleting.id);
    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <FormError message={error} />

      <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nova tag (ex.: Trabalho)"
          maxLength={30}
          aria-label="Nome da nova tag"
        />
        <Button
          type="submit"
          disabled={pending === "create" || !newName.trim()}
          className="sm:w-auto"
        >
          {pending === "create" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Criar tag
        </Button>
      </form>

      {tags.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <TagIcon className="h-4 w-4" />
          Nenhuma tag cadastrada.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex min-h-12 items-center gap-3 px-3 py-2"
            >
              <TagIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {tag.nome}
              </span>
              <Badge variant="secondary">
                {tag.transactionCount} lançamento(s)
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label={`Renomear tag ${tag.nome}`}
                onClick={() => {
                  setError(null);
                  setEditName(tag.nome);
                  setEditing(tag);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-muted-foreground hover:text-destructive"
                aria-label={`Excluir tag ${tag.nome}`}
                onClick={() => {
                  setError(null);
                  setDeleting(tag);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renomear tag</DialogTitle>
            <DialogDescription>
              O novo nome será usado em todos os lançamentos vinculados.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={editName}
            onChange={(event) => setEditName(event.target.value)}
            maxLength={30}
            autoFocus={!isMobile}
            aria-label="Novo nome da tag"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={pending === "rename"}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleRename()}
              disabled={pending === "rename" || !editName.trim()}
            >
              {pending === "rename" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir tag</DialogTitle>
            <DialogDescription>
              A tag <strong className="text-foreground">{deleting?.nome}</strong>{" "}
              será removida dos lançamentos. Os lançamentos continuam
              existindo.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={pending === "delete"}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={pending === "delete"}
            >
              {pending === "delete" && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Excluir tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
