"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
};

export function CalendarPanel({
  value,
  onSelect,
  onClose,
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
    onClose();
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
    <div className="space-y-2 p-2" onKeyDown={handleKeyDown}>
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
          className="min-h-11 rounded-md px-3 text-sm font-semibold capitalize hover:bg-accent"
          aria-label="Escolher mês e ano"
        >
          {formatMonthTitle(viewMonth)}
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
                className="grid h-8 place-items-center text-[11px] font-medium text-muted-foreground"
              >
                {weekday}
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
                    "grid h-11 w-11 place-items-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

          <div className="flex items-center justify-between border-t border-border px-1 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => select(today)}
            >
              Hoje
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {formatMonthTitle(viewMonth)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
