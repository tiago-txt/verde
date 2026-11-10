"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "dark" | "light";

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light",
    );
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    const root = document.documentElement;
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("verde-theme", next);
    } catch {
      // localStorage indisponível (modo privado); o tema vale só nesta sessão.
    }
    setTheme(next);
  }

  const label =
    theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro";

  if (withLabel) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Tema da interface</p>
          <p className="text-sm text-muted-foreground">
            {theme === "dark" ? "Escuro" : "Claro"} — você pode alternar quando
            quiser.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={toggle}
          aria-label={label}
          title={label}
        >
          {mounted && theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
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
    >
      {mounted && theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  );
}
