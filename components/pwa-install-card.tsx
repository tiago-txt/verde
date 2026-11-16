"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export function PwaInstallCard() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    setInstalled(standalone);

    function handlePrompt(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    function handleInstalled() {
      setInstalled(true);
      setPromptEvent(null);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      // O usuário pode fechar o prompt; o card continua com as instruções.
    } finally {
      setPromptEvent(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <span className="tile grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <CardTitle>Aplicativo</CardTitle>
          <CardDescription>
            Instale para abrir sem a barra do navegador.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        {installed ? (
          <p className="flex items-center gap-2 font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            App instalado neste dispositivo.
          </p>
        ) : (
          <>
            <p>
              A barra do Chrome só desaparece quando o Verde é instalado como
              aplicativo. Numa aba comum ela não pode ser removida.
            </p>
            {promptEvent ? (
              <Button type="button" onClick={() => void install()}>
                <Download className="h-4 w-4" />
                Instalar app
              </Button>
            ) : (
              <p>
                No Chrome do Android, abra o menu <strong>⋮</strong> e escolha{" "}
                <strong>Instalar app</strong> ou{" "}
                <strong>Adicionar à tela inicial</strong>.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
