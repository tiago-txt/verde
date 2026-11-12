"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function DecorationsToggle() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    setEnabled(document.documentElement.dataset.decorations !== "off");
  }, []);

  function toggle(next: boolean) {
    setEnabled(next);
    document.documentElement.dataset.decorations = next ? "on" : "off";
    try {
      localStorage.setItem("verde-decorations", next ? "on" : "off");
    } catch {
      // Storage indisponível: vale só nesta sessão.
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-grout bg-forest-container/40 p-3">
      <div className="flex items-start gap-3">
        <span className="tile grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-grout bg-forest-high text-amber">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Decorações</p>
          <p className="text-xs text-muted-foreground">
            Padrões de azulejo, brilhos e glifos. Pastilhas e emblemas continuam.
          </p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={toggle}
        aria-label="Ligar decorações de azulejo"
      />
    </div>
  );
}
