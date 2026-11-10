import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <SearchX className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">
            O endereço que você abriu não existe ou foi movido.
          </p>
        </div>
        <Button asChild>
          <Link href="/">Voltar para a visão geral</Link>
        </Button>
      </div>
    </div>
  );
}
