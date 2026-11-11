"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/** Limpa qualquer estado local/cache antes de encerrar a sessão. */
export async function clearClientState() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("verde")) localStorage.removeItem(key);
    }
    sessionStorage.clear();
  } catch {
    // Storage indisponível (modo privado): nada a limpar.
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Cache API indisponível: o logout continua.
  }
}

type LogoutButtonProps = {
  className?: string;
  compact?: boolean;
  children?: React.ReactNode;
};

export function LogoutButton({
  className,
  compact = false,
  children,
}: LogoutButtonProps) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await clearClientState();
      await logoutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md text-sm transition-colors hover:bg-accent disabled:opacity-60",
        compact ? "w-full px-2" : "w-full px-2",
        className,
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
      {children ?? (compact ? null : "Sair")}
    </button>
  );
}
