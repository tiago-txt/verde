"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthYearPanel } from "./month-year-panel";
import {
  buildMonthGrid,
  firstDayOfWeek,
  lastDayOfWeek,
  moveDateByDays,
  WEEKDAYS,
} from "@/lib/finance/calendar";
import { addMonths, dateInMonth, todayISO } from "@/lib/dates";
import { formatDate, formatMonthTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

type CalendarPanelProps = {
  value: string | null;
  onSelect: (iso: string) => void;
  onClose: () => void;
  /** Mobile: a seleção vira rascunho até o usuário confirmar em OK. */
  confirmMode?: boolean;
  /** Cabe em telas pequenas (360×640) sem cortar o rodapé. */
  compact?: boolean;
};

export function CalendarPanel({
  value,
  onSelect,
  onClose,
  confirmMode = false,
  compact = false,
}: CalendarPanelProps) {
  const today = todayISO();
  const [viewMonth, setViewMonth] = useState(
    value?.slice(0, 7) ?? today.slice(0, 7),
  );
  const [focusedIso, setFocusedIso] = useState(value ?? today);
  const [monthMode, setMonthMode] = useState(false);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    if (value) {
      setFocusedIso(value);
      setViewMonth(value.slice(0, 7));
    }
  }, [value]);

  const cells = useMemo(
    () => buildMonthGrid(viewMonth, today),
    [viewMonth, today],
  );

  useEffect(() => {
    if (monthMode) return;
    dayRefs.current.get(focusedIso)?.focus();
  }, [focusedIso, viewMonth, monthMode]);

  function select(iso: string) {
    onSelect(iso);
    if (!confirmMode) onClose();
  }

  function moveFocus(iso: string) {
    setFocusedIso(iso);
    setViewMonth(iso.slice(0, 7));
  }

  function changeMonth(delta: number) {
    const next = addMonths(viewMonth, delta);
    const day = Number(focusedIso.slice(8, 10)) || 1;
    setViewMonth(next);
    setFocusedIso(dateInMonth(next, day));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (monthMode) return;

    let next: string | null = null;

    switch (event.key) {
      case "ArrowLeft":
        next = moveDateByDays(focusedIso, -1);
        break;
      case "ArrowRight":
        next = moveDateByDays(focusedIso, 1);
        break;
      case "ArrowUp":
        next = moveDateByDays(focusedIso, -7);
        break;
      case "ArrowDown":
        next = moveDateByDays(focusedIso, 7);
        break;
      case "Home":
        next = firstDayOfWeek(focusedIso);
        break;
      case "End":
        next = lastDayOfWeek(focusedIso);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        select(focusedIso);
        return;
      default:
        return;
    }

    event.preventDefault();
    moveFocus(next);
  }

  return (
    <div className={cn("p-2", compact ? "space-y-1" : "space-y-2")} onKeyDown={handleKeyDown}>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label="Mês anterior"
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={() => setMonthMode((current) => !current)}
          className={cn("inline-flex items-center gap-1 rounded-md px-3 text-sm font-semibold capitalize hover:bg-accent", compact ? "min-h-10" : "min-h-11")}
          aria-label="Escolher mês e ano"
        >
          {formatMonthTitle(viewMonth)}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          aria-label="Próximo mês"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {monthMode ? (
        <MonthYearPanel
          value={viewMonth}
          onSelect={(monthKey) => {
            const day = Number(focusedIso.slice(8, 10)) || 1;
            setViewMonth(monthKey);
            setFocusedIso(dateInMonth(monthKey, day));
            setMonthMode(false);
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                className={cn("grid place-items-center text-xs font-medium text-muted-foreground", compact ? "h-7" : "h-8")}
              >
                {confirmMode ? weekday.slice(0, 1) : weekday}
              </div>
            ))}
            {cells.map((cell) => {
              const selected = value === cell.iso;
              const focused = focusedIso === cell.iso;
              return (
                <button
                  key={cell.iso}
                  ref={(element) => {
                    if (element) dayRefs.current.set(cell.iso, element);
                    else dayRefs.current.delete(cell.iso);
                  }}
                  type="button"
                  tabIndex={focused ? 0 : -1}
                  onClick={() => select(cell.iso)}
                  onFocus={() => setFocusedIso(cell.iso)}
                  aria-label={formatDate(cell.iso)}
                  aria-current={cell.isToday ? "date" : undefined}
                  className={cn(
                    "grid place-items-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", compact ? "h-10 w-10" : "h-11 w-11",
                    !cell.inMonth && "text-muted-foreground/35",
                    cell.isToday &&
                      !selected &&
                      "font-semibold text-primary ring-1 ring-primary/50",
                    selected
                      ? "bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                      : "hover:bg-accent",
                  )}
                >
                  {Number(cell.iso.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <div className={cn("flex items-center justify-end border-t border-border px-1", compact ? "pt-1" : "pt-2")}>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-full px-4"
              onClick={() => select(today)}
            >
              Hoje
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
