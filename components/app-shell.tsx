"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LineChart,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  SunMoon,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { MobileMoreSheet } from "@/components/mobile-more-sheet";
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
  { href: "/previsao", label: "Previsão", icon: LineChart },
  { href: "/limite-de-gastos", label: "Orçamentos", icon: Target },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
];

const MOBILE_LEFT: NavItem[] = [
  { href: "/", label: "Início", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ArrowLeftRight },
];

const MOBILE_RIGHT: NavItem[] = [
  { href: "/limite-de-gastos", label: "Orçamentos", icon: Target },
];

const MORE_PREFIXES = [
  "/relatorios",
  "/previsao",
  "/contas",
  "/cartoes",
  "/configuracoes",
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

type AppShellProps = {
  user: { userId: string; nome: string; email: string; isAdmin: boolean };
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const sidebarKey = `verde:${user.userId}:sidebar-collapsed`;
  const moreActive = MORE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  function openNewTransaction() {
    if (
      pathname.startsWith("/lancamentos") ||
      pathname.startsWith("/cartoes/")
    ) {
      window.dispatchEvent(new Event("verde:new-transaction"));
      return;
    }
    router.push("/lancamentos?novo=1");
  }

  useEffect(() => {
    const stored = localStorage.getItem(sidebarKey);
    setCollapsed(
      stored !== null ? stored === "1" : window.innerWidth < 1024,
    );
  }, [sidebarKey]);

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
        localStorage.setItem(sidebarKey, next ? "1" : "0");
        return next;
      });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sidebarKey]);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(sidebarKey, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="relative min-h-dvh bg-background">
      <div
        aria-hidden="true"
        className="deco-pattern-page azulejo azulejo-mask pointer-events-none fixed inset-0 z-0 hidden lg:block"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-grout/70 bg-surface-lowest shadow-[0_12px_32px_-8px_rgba(7,16,11,0.9)] transition-[width] duration-150 lg:flex",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <div
          className={cn(
            "relative flex h-20 shrink-0 items-center overflow-hidden border-b border-grout/60 bg-gradient-to-b from-forest-container to-transparent",
            collapsed ? "justify-center px-2" : "justify-between px-4",
          )}
        >
          <div
            aria-hidden="true"
            className="deco-pattern-hero azulejo absolute inset-0"
          />
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Expandir menu"
              title="Expandir menu ([)"
              className="relative z-10 grid h-12 w-12 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-forest-high hover:text-foreground"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          ) : (
            <>
              <Brand className="relative z-10" />
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Recolher menu"
                title="Recolher menu ([)"
                className="relative z-10 grid h-12 w-12 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-forest-high hover:text-foreground"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <p className="px-5 pb-1 pt-4 font-mono text-xs uppercase tracking-[0.08em] text-outline">
            Módulos
          </p>
        )}

        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto py-2",
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
                  "relative flex h-12 items-center rounded-lg border text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "border-primary/30 bg-primary/20 text-primary"
                    : "border-transparent text-sidebar-foreground/75 hover:bg-forest-high hover:text-sidebar-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div
          className={cn(
            "space-y-2 border-t border-grout/60 bg-forest-container/40 p-2",
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
              "flex h-12 items-center rounded-lg border border-transparent text-sm font-medium transition-colors",
              collapsed ? "w-12 justify-center" : "gap-3 px-3",
              pathname.startsWith("/configuracoes")
                ? "border-primary/30 bg-primary/20 text-primary"
                : "text-sidebar-foreground/75 hover:bg-forest-high hover:text-sidebar-foreground",
            )}
          >
            <Settings className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {!collapsed && "Configurações"}
          </Link>
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border border-grout/50 bg-surface-lowest/70 px-2",
              collapsed ? "flex-col py-1" : "justify-between py-1.5",
            )}
          >
            {!collapsed && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <SunMoon className="h-4 w-4 text-amber" aria-hidden="true" />
                Tema
              </span>
            )}
            <ThemeToggle />
          </div>
          <UserMenu
            nome={user.nome}
            email={user.email}
            isAdmin={user.isAdmin}
            compact={collapsed}
          />
        </div>
      </aside>

      <div className="relative z-10 transition-[padding] duration-150 lg:pl-[var(--sidebar-width,260px)]">
        <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] pt-4 lg:px-8 lg:pb-28 lg:pt-7">
          {children}
        </main>
      </div>

      <nav
        aria-label="Navegação principal"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-grout bg-surface-lowest/95 lg:hidden"
      >
        <div className="grid h-14 grid-cols-5 items-stretch">
          {MOBILE_LEFT.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-6 w-6",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={openNewTransaction}
            aria-label="Novo lançamento"
            className="relative flex h-14 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="-translate-y-1 grid h-[52px] w-[52px] place-items-center rounded-full bg-primary-fill text-primary-fill-foreground shadow-md">
              <Plus className="h-6 w-6" aria-hidden="true" />
            </span>
          </button>

          {MOBILE_RIGHT.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-6 w-6",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                {item.label}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-pressed={moreActive}
            aria-label="Mais"
            className={cn(
              "relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              moreActive ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Menu
              className={cn(
                "h-6 w-6",
                moreActive ? "text-primary" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
            Mais
          </button>
        </div>
      </nav>

      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} user={user} />
    </div>
  );
}
