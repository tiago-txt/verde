"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuProps = {
  nome: string;
  email: string;
  isAdmin: boolean;
  compact?: boolean;
};

export function UserMenu({
  nome,
  email,
  isAdmin,
  compact = false,
}: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu do usuário"
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-md text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
            compact ? "h-11 w-11 justify-center p-0" : "w-full px-2 py-1.5",
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
            {getInitials(nome)}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{nome}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">{nome}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {email}
          </span>
          {isAdmin && (
            <span className="mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              Administrador
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/configuracoes">
            <Settings />
            Configurações
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
