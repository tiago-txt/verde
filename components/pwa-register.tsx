"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Registra o service worker apenas em produção. Quando uma nova versão é
 * instalada, mostra um aviso para o usuário ativar a atualização — evitando que
 * o app fique preso em um cache antigo.
 */
export function PwaRegister() {
  const [ready, setReady] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | null = null;
    let updateHandler: (() => void) | null = null;
    let disposed = false;

    void navigator.serviceWorker
      .register("/sw.js")
      .then((registered) => {
        if (disposed) return;
        registration = registered;

        const checkInstalling = () => {
          const worker = registered.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setReady(registered);
            }
          });
        };

        updateHandler = checkInstalling;
        checkInstalling();
        registered.addEventListener("updatefound", checkInstalling);
        if (registered.waiting && navigator.serviceWorker.controller) {
          setReady(registered);
        }
      })
      .catch(() => {
        // Registro é uma melhoria progressiva; falhas não bloqueiam o app.
      });

    function handleControllerChange() {
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      if (registration && updateHandler) {
        registration.removeEventListener("updatefound", updateHandler);
      }
    };
  }, []);

  if (!ready || dismissed) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[80] flex justify-end sm:inset-x-auto sm:bottom-4 sm:right-4"
    >
      <div className="pointer-events-auto flex max-w-[360px] items-center gap-3 rounded-lg border border-primary/40 bg-card p-3 shadow-xl">
        <RefreshCw className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">
          Nova versão disponível.
        </p>
        <Button
          type="button"
          size="sm"
          className="h-11 shrink-0 sm:h-9"
          onClick={() => {
            ready.waiting?.postMessage({ type: "SKIP_WAITING" });
            setDismissed(true);
          }}
        >
          Atualizar
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dispensar aviso de atualização"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
