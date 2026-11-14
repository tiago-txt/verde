"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastInput = {
  title?: string;
  description: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
} as const;

const TONES = {
  info: "border-border bg-card text-foreground",
  success: "border-success/40 bg-card text-foreground",
  warning: "border-warning/50 bg-card text-foreground",
  error: "border-destructive/50 bg-card text-foreground",
} as const;

const ICON_TONES = {
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const item: ToastItem = {
        ...input,
        id,
        tone: input.tone ?? "info",
        duration: input.duration ?? 6000,
      };
      setItems((current) => [...current.slice(-3), item]);
      const timer = setTimeout(() => dismiss(id), item.duration);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4"
      >
        {items.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === "warning" || item.tone === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-lg border p-3 shadow-xl max-sm:shadow-md sm:w-[380px]",
                TONES[item.tone],
              )}
            >
              <Icon
                className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TONES[item.tone])}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                {item.title && (
                  <p className="text-sm font-semibold">{item.title}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Fechar aviso"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-8 sm:w-8"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }
  return context;
}
