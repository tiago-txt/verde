"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MonthYearPanel } from "./month-year-panel";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { formatMonthTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

type MonthPickerProps = {
  month: string;
  onChange: (monthKey: string) => void;
  className?: string;
  /** Quando true, mostra o placeholder em vez do mês (ex.: fim opcional). */
  empty?: boolean;
  placeholder?: string;
};

export function MonthPicker({
  month,
  onChange,
  className,
  empty = false,
  placeholder = "Escolher mês",
}: MonthPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const button = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-2 text-base font-semibold capitalize transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        empty && "normal-case",
        className,
      )}
      aria-label="Escolher mês e ano"
    >
      {empty ? (
        <span className="text-muted-foreground">{placeholder}</span>
      ) : (
        formatMonthTitle(month)
      )}
    </button>
  );

  const panel = (
    <MonthYearPanel
      value={month}
      onSelect={(monthKey) => {
        onChange(monthKey);
        setOpen(false);
      }}
    />
  );

  if (isMobile) {
    return (
      <>
        {button}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="p-0 sm:max-w-sm">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Escolher mês</DialogTitle>
            </DialogHeader>
            <div className="p-3">{panel}</div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent align="center" className="w-auto p-3">
        {panel}
      </PopoverContent>
    </Popover>
  );
}
