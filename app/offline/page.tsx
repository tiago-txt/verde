import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Brand } from "@/components/brand";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Brand />
      <span className="grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
        <WifiOff className="h-6 w-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">Sem conexão</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O Verde precisa de conexão para carregar seus dados financeiros. Seus
        lançamentos não são armazenados em cache no navegador.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Tentar novamente
      </Link>
    </main>
  );
}
