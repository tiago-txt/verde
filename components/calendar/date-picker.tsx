"use client";

import { useEffect, useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarPanel } from "./calendar-panel";
import { maskBRDate, parseBRDate } from "@/lib/finance/date-input";
import {
  cancelDateSelection,
  confirmDateSelection,
  openDateSelection,
  selectDate,
} from "@/lib/finance/date-selection";
import { todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id?: string;
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Campo de data com digitação mascarada (dd/MM/yyyy), calendário em popover
 * no desktop e bottom sheet no mobile. O valor trafega sempre como ISO.
 */
export function DatePicker({
  id,
  value,
  onChange,
  disabled,
  autoFocus,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: DatePickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? formatDate(value) : "");
  const [selection, setSelection] = useState(() =>
    openDateSelection(value, todayISO()),
  );

  useEffect(() => {
    setText(value ? formatDate(value) : "");
  }, [value]);

  useEffect(() => {
    if (open) setSelection(openDateSelection(value, todayISO()));
  }, [open, value]);

  function handleTextChange(event: React.ChangeEvent<HTMLInputElement>) {
    const masked = maskBRDate(event.target.value);
    setText(masked);
    const iso = parseBRDate(masked);
    if (iso) onChange(iso);
  }

  function handleBlur() {
    if (!text) {
      if (value) onChange("");
      return;
    }
    if (!parseBRDate(text)) onChange("");
  }

  function handleSelect(iso: string) {
    onChange(iso);
    setText(formatDate(iso));
    setOpen(false);
  }

  const field = (
    <div className="relative">
      <Input
        id={id}
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") setOpen(false);
        }}
        placeholder="dd/mm/aaaa"
        inputMode="numeric"
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Abrir calendário"
        className="absolute inset-y-0 right-0 grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
    </div>
  );

  if (isMobile) {
    const draftDate = new Date(`${selection.draft}T12:00:00Z`);
    const rawLongDate = new Intl.DateTimeFormat("pt-BR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    }).format(draftDate);
    const longDate = rawLongDate.charAt(0).toUpperCase() + rawLongDate.slice(1);

    return (
      <>
        {field}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="!inset-auto !left-1/2 !top-1/2 !m-0 !w-[min(92vw,360px)] !-translate-x-1/2 !-translate-y-1/2 !rounded-2xl !border-0 p-0"
            showClose={false}
          >
            <div className="relative rounded-t-2xl bg-primary px-5 pb-5 pt-4 text-primary-foreground">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar calendário"
                className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-xl text-primary-foreground/80 transition-colors hover:bg-black/10 hover:text-primary-foreground"
              >
                <X className="h-5 w-5" />
              </button>
              <p className="text-xs font-medium opacity-80">Selecione a data</p>
              <p className="mt-1 text-2xl font-semibold">{longDate}</p>
            </div>
            <CalendarPanel
              value={selection.draft}
              confirmMode
              onSelect={(iso) =>
                setSelection((current) => selectDate(current, iso))
              }
              onClose={() => setOpen(false)}
            />
            <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                className="h-12"
                onClick={() => {
                  setSelection((current) => ({
                    ...current,
                    draft: cancelDateSelection(current),
                  }));
                  setOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="h-12"
                onClick={() => {
                  onChange(confirmDateSelection(selection));
                  setOpen(false);
                }}
              >
                OK
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{field}</PopoverAnchor>
      <PopoverContent align="start" className="w-auto p-0">
        <CalendarPanel
          value={value || null}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
