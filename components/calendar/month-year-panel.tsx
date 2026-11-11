"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { currentMonth } from "@/lib/dates";
import { MONTHS_SHORT } from "@/lib/format";
import { cn } from "@/lib/utils";

type MonthYearPanelProps = {
  value: string;
  onSelect: (monthKey: string) => void;
  className?: string;
};

export function MonthYearPanel({
  value,
  onSelect,
  className,
}: MonthYearPanelProps) {
  const [viewYear, setViewYear] = useState(() => Number(value.slice(0, 4)));
  const [mode, setMode] = useState<"months" | "years">("months");

  useEffect(() => {
    setViewYear(Number(value.slice(0, 4)));
  }, [value]);

  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const yearPageStart = Math.floor(viewYear / 12) * 12;
  const years = Array.from({ length: 12 }, (_, index) => yearPageStart + index);

  function move(delta: number) {
    setViewYear((year) => year + delta);
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label={mode === "months" ? "Ano anterior" : "Página anterior"}
          onClick={() => move(mode === "months" ? -1 : -12)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          className="min-h-11 rounded-md px-3 text-sm font-semibold hover:bg-accent"
          onClick={() => setMode(mode === "months" ? "years" : "months")}
          aria-label={
            mode === "months"
              ? "Escolher ano"
              : "Voltar para seleção de mês"
          }
        >
          {mode === "months"
            ? viewYear
            : `${yearPageStart}–${yearPageStart + 11}`}
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label={mode === "months" ? "Próximo ano" : "Próxima página"}
          onClick={() => move(mode === "months" ? 1 : 12)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {mode === "months" ? (
        <div className="grid grid-cols-3 gap-1">
          {MONTHS_SHORT.map((month, index) => {
            const monthNumber = index + 1;
            const selected =
              selectedYear === viewYear && selectedMonth === monthNumber;
            return (
              <button
                key={month}
                type="button"
                onClick={() =>
                  onSelect(
                    `${viewYear}-${String(monthNumber).padStart(2, "0")}`,
                  )
                }
                className={cn(
                  "min-h-11 rounded-md px-2 text-sm font-medium capitalize transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {month}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => {
                setViewYear(year);
                setMode("months");
              }}
              className={cn(
                "min-h-11 rounded-md px-2 text-sm font-medium transition-colors",
                year === selectedYear
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {year}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-full px-4"
          onClick={() => onSelect(currentMonth())}
        >
          Mês atual
        </Button>
      </div>
    </div>
  );
}
