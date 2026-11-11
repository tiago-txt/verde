"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
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
  { href: "/limite-de-gastos", label: "Orçamentos", icon: Target },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/limite-de-gastos", label: "Orçamentos", icon: Target },
  { href: "/configuracoes", label: "Perfil", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type AppShellProps = {
  user: { nome: string; email: string; isAdmin: boolean };
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isTransactionsPage = pathname.startsWith("/lancamentos");
  const hideFloatingNew =
    pathname === "/" ||
    pathname.startsWith("/limite-de-gastos") ||
    pathname.startsWith("/relatorios") ||
    pathname.startsWith("/cartoes");

  useEffect(() => {
    const stored = localStorage.getItem("verde-sidebar-collapsed");
    setCollapsed(
      stored !== null ? stored === "1" : window.innerWidth < 1024,
    );
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      collapsed ? "72px" : "260px",
    );
    return () => {
      document.documentElement.style.removeProperty("--sidebar-width");
    };
  }, [collapsed]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key !== "[") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      setCollapsed((current) => {
        const next = !current;
        localStorage.setItem("verde-sidebar-collapsed", next ? "1" : "0");
        return next;
      });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("verde-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border/80 bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "azulejo relative flex h-16 shrink-0 items-center border-b border-border/70",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expandir menu"
              title="Expandir menu ([)"
              className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          ) : (
            <>
              <Brand />
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Recolher menu"
                title="Recolher menu ([)"
                className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto py-4",
            collapsed ? "px-2" : "px-3",
          )}
          aria-label="Navegação principal"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "relative flex h-12 items-center rounded-xl text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_hsl(var(--gold)/.35)]"
                    : "text-sidebar-foreground/75 hover:bg-accent hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-gold"
                    aria-hidden="true"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "space-y-1 border-t border-border/70 p-2",
            collapsed && "flex flex-col items-center",
          )}
        >
          <Link
            href="/configuracoes"
            aria-current={
              pathname.startsWith("/configuracoes") ? "page" : undefined
            }
            title={collapsed ? "Configurações" : undefined}
            className={cn(
              "flex h-12 items-center rounded-xl text-sm font-medium transition-colors",
              collapsed ? "w-12 justify-center" : "gap-3 px-3",
              pathname.startsWith("/configuracoes")
                ? "bg-primary/15 text-primary"
                : "text-sidebar-foreground/75 hover:bg-accent hover:text-sidebar-foreground",
            )}
          >
            <Settings className="h-5 w-5 shrink-0" aria-hidden="true" />
            {!collapsed && "Configurações"}
          </Link>
          <div
            className={cn(
              "flex items-center gap-1",
              collapsed ? "flex-col" : "justify-between",
            )}
          >
            <ThemeToggle />
            <UserMenu
              nome={user.nome}
              email={user.email}
              isAdmin={user.isAdmin}
              compact={collapsed}
            />
          </div>
        </div>
      </aside>

      <div className="transition-[padding] duration-200 lg:pl-[var(--sidebar-width,260px)]">
        <main className="mx-auto w-full max-w-7xl px-4 pb-40 pt-4 lg:px-8 lg:pb-28 lg:pt-7">
          {children}
        </main>
      </div>

      {!hideFloatingNew &&
        (isTransactionsPage ? (
          <button
            type="button"
            aria-label="Novo lançamento"
            onClick={() =>
              window.dispatchEvent(new Event("verde:new-transaction"))
            }
            className="verde-fab pressable fixed bottom-[calc(4rem+var(--verde-summary-height,4rem)+0.75rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-[bottom,opacity] duration-200 lg:hidden"
          >
            <Plus className="h-8 w-8" aria-hidden="true" />
          </button>
        ) : (
          <Link
            href="/lancamentos?novo=1"
            aria-label="Novo lançamento"
            className="verde-fab pressable fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-16 w-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-opacity lg:hidden"
          >
            <Plus className="h-8 w-8" aria-hidden="true" />
          </Link>
        ))}

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
                  "relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {active && (
                  <span
                    className="absolute top-0 h-0.5 w-8 rounded-full bg-gold"
                    aria-hidden="true"
                  />
                )}
                <item.icon className="h-6 w-6" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
