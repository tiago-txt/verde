"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  Plus,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Visão geral", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/limites", label: "Limite de gastos", icon: Target },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/limites", label: "Limites", icon: Target },
  { href: "/configuracoes", label: "Perfil", icon: Settings },
];

const PAGE_TITLES: Record<string, string> = {
  "/": "Visão geral",
  "/lancamentos": "Lançamentos",
  "/relatorios": "Relatórios",
  "/limites": "Limite de gastos",
  "/contas": "Contas",
  "/cartoes": "Cartões",
  "/configuracoes": "Configurações",
  "/configuracoes/categorias": "Categorias e tags",
};

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type AppShellProps = {
  user: { nome: string; email: string; isAdmin: boolean };
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const pageTitle = PAGE_TITLES[pathname] ?? "Verde";
  const isTransactionsPage = pathname.startsWith("/lancamentos");

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center border-b border-border/70 px-5">
          <Brand />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-sidebar-foreground/75 hover:bg-accent hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-border/70 p-3">
          <Link
            href="/configuracoes"
            className={cn(
              "flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
              pathname.startsWith("/configuracoes")
                ? "bg-primary/10 text-primary"
                : "text-sidebar-foreground/75 hover:bg-accent hover:text-sidebar-foreground",
            )}
          >
            <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
            Configurações
          </Link>
          <UserMenu
            nome={user.nome}
            email={user.email}
            isAdmin={user.isAdmin}
          />
        </div>
      </aside>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur lg:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <h1 className="hidden truncate text-sm font-medium text-muted-foreground lg:block">
              {pageTitle}
            </h1>
            <span className="truncate text-base font-semibold lg:hidden">
              {pageTitle}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link href="/lancamentos?novo=1">
                <Plus className="h-4 w-4" />
                Novo lançamento
              </Link>
            </Button>
            <ThemeToggle />
            <div className="lg:hidden">
              <UserMenu
                nome={user.nome}
                email={user.email}
                isAdmin={user.isAdmin}
                compact
              />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-32 pt-5 lg:px-8 lg:pb-12 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Botão flutuante (mobile) — na tela de lançamentos o "+" fica no cabeçalho
          para não conflitar com a barra de resumo fixa. */}
      {!isTransactionsPage && (
        <Link
          href="/lancamentos?novo=1"
          aria-label="Novo lançamento"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-transform active:scale-95 lg:hidden"
        >
          <Plus className="h-7 w-7" aria-hidden="true" />
        </Link>
      )}

      {/* Bottom navigation (mobile) */}
      <nav
        aria-label="Navegação principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-sidebar/95 backdrop-blur lg:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
