"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/calendar/month-picker";
import { addMonths, currentMonth } from "@/lib/dates";

export function DashboardMonthHeader({ month }: { month: string }) {
  const router = useRouter();

  function go(next: string) {
    router.push(next === currentMonth() ? "/" : `/?mes=${next}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-grout bg-forest-container/90 p-1 shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)]">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-lg"
          aria-label="Mês anterior"
          onClick={() => go(addMonths(month, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <MonthPicker month={month} onChange={go} className="text-center" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-lg"
          aria-label="Próximo mês"
          onClick={() => go(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button asChild variant="outline" className="h-11">
          <a href="/relatorios">Relatórios</a>
        </Button>
        <Button asChild className="h-11">
          <a href="/lancamentos?novo=1">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo lançamento</span>
            <span className="sm:hidden">Novo</span>
          </a>
        </Button>
      </div>
    </div>
  );
}
