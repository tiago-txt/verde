import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Leaf, Server, ShieldCheck, Smartphone } from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

const highlights = [
  {
    icon: ShieldCheck,
    title: "Seus dados, só seus",
    description: "Tudo fica no seu servidor. Sem bancos, sem terceiros.",
  },
  {
    icon: Smartphone,
    title: "No celular e no computador",
    description: "Instale como app no celular e use o dashboard no desktop.",
  },
  {
    icon: Server,
    title: "Self-hosted",
    description: "Backup simples, Docker Compose e um único banco SQLite.",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  // Só redireciona se o usuário do token ainda existir no banco. Isso evita
  // loop / ↔ /login quando o cookie é de outro banco/usuário removido.
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Painel de marca (desktop) */}
      <section className="azulejo relative hidden overflow-hidden border-r border-border bg-sidebar p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(120,80,40,0.14),transparent_50%)]"
        />

        <Brand className="relative" />

        <div className="relative max-w-lg space-y-8">
          <div className="space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Leaf className="h-3.5 w-3.5" />
              Finanças da família
            </span>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Clareza para o seu dinheiro,{" "}
              <span className="text-primary">todos os dias.</span>
            </h1>
            <p className="text-base text-muted-foreground">
              Registre despesas, acompanhe faturas e planeje o mês — em uma
              interface simples, em português e feita para durar.
            </p>
          </div>

          <ul className="space-y-5">
            {highlights.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-muted-foreground">
          Verde · open source, self-hosted · R$ BRL
        </p>
      </section>

      {/* Formulário */}
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-6 lg:hidden">
            <Brand />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              Entrar na sua conta
            </h2>
            <p className="text-sm text-muted-foreground">
              Use o e-mail e a senha cadastrados no Verde.
            </p>
          </div>

          <LoginForm next={next} />

          <div className="rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Primeiro acesso? O usuário inicial é criado a partir de{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              ADMIN_EMAIL
            </code>{" "}
            e{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
              ADMIN_PASSWORD
            </code>{" "}
            no primeiro boot.
          </div>
        </div>
      </section>
    </main>
  );
}
