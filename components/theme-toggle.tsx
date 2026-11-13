"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light" | "system";

function resolveDark(theme: Theme): boolean {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "dark";
}

export function ThemeToggle({
  withLabel = false,
  className,
}: {
  withLabel?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("verde-theme");
    setTheme(
      stored === "light" || stored === "system" || stored === "dark"
        ? stored
        : "dark",
    );
  }, []);

  function apply(next: Theme) {
    const root = document.documentElement;
    const dark = resolveDark(next);
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    try {
      localStorage.setItem("verde-theme", next);
    } catch {
      // localStorage indisponível (modo privado); o tema vale só nesta sessão.
    }
    setTheme(next);
  }

  function toggle() {
    apply(resolveDark(theme) ? "light" : "dark");
  }

  const label =
    resolveDark(theme) ? "Mudar para tema claro" : "Mudar para tema escuro";

  if (withLabel) {
    const options: { value: Theme; label: string; icon: typeof Sun }[] = [
      { value: "light", label: "Claro", icon: Sun },
      { value: "dark", label: "Escuro", icon: Moon },
      { value: "system", label: "Sistema", icon: Monitor },
    ];
    return (
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Tema da interface</p>
          <p className="text-sm text-muted-foreground">
            Escolha claro, escuro ou siga o sistema.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const Icon = option.icon;
            const active = theme === option.value;
            return (
              <Button
                key={option.value}
                type="button"
                variant={active ? "default" : "outline"}
                className={cn("h-12 sm:h-10", active && "enamel")}
                aria-pressed={active}
                onClick={() => apply(option.value)}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={className}
    >
      {mounted && resolveDark(theme) ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
}
