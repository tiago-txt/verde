"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
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

  useEffect(() => {
    setText(value ? formatDate(value) : "");
  }, [value]);

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
    return (
      <>
        {field}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-sm">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Escolher data</DialogTitle>
            </DialogHeader>
            <CalendarPanel
              value={value || null}
              onSelect={handleSelect}
              onClose={() => setOpen(false)}
            />
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
