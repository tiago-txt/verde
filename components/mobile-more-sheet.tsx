"use client";

import Link from "next/link";
import {
  BarChart3,
  CreditCard,
  LineChart,
  LogOut,
  Settings,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { clearClientState } from "@/components/auth/logout-button";
import { logoutAction } from "@/lib/actions/auth";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";

type MobileMoreSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { nome: string; email: string; isAdmin: boolean };
};

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/previsao", label: "Previsão", icon: LineChart },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

const cellClass =
  "flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-lg border border-grout bg-surface-lowest px-1 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-forest-high hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MobileMoreSheet({
  open,
  onOpenChange,
  user,
}: MobileMoreSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mais</DialogTitle>
          <DialogDescription className="sr-only">
            Atalhos para as demais áreas do Verde.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border border-grout bg-surface-low p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {getInitials(user.nome)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {user.nome}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </span>
          {user.isAdmin && (
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
              Admin
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => onOpenChange(false)}
                className={cellClass}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          <div className={cn(cellClass, "hover:bg-transparent")}>
            <ThemeToggle className="h-12 w-12" />
            <span>Tema</span>
          </div>

          <Link
            href="/configuracoes/perfil"
            onClick={() => onOpenChange(false)}
            className={cellClass}
          >
            <UserRound className="h-6 w-6" aria-hidden="true" />
            Perfil
          </Link>

          <button
            type="button"
            onClick={() => {
              void (async () => {
                await clearClientState();
                await logoutAction();
              })();
            }}
            className={cn(cellClass, "text-destructive")}
          >
            <LogOut className="h-6 w-6" aria-hidden="true" />
            Sair
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
