import type { Metadata } from "next";
import Link from "next/link";
import { Database, LogOut, Tags, Users, Wallet, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/actions/auth";
import { requireUser } from "@/lib/auth/current-user";
import { formatDateTime, getInitials } from "@/lib/format";

export const metadata: Metadata = { title: "Configurações" };

export default async function ConfiguracoesPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Sua conta, aparência e informações do servidor."
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/contas">
            <Wallet className="h-4 w-4" />
            Contas
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/cartoes">
            <CreditCard className="h-4 w-4" />
            Cartões
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/configuracoes/categorias">
            <Tags className="h-4 w-4" />
            Categorias
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12 justify-start">
          <Link href="/configuracoes/dados">
            <Database className="h-4 w-4" />
            Dados
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>Dados do seu usuário no Verde.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
                {getInitials(user.nome)}
              </span>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{user.nome}</p>
                  <Badge variant={user.isAdmin ? "default" : "secondary"}>
                    {user.isAdmin ? "Administrador" : "Membro"}
                  </Badge>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-sm">
              <dt className="text-muted-foreground">No Verde desde</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              Edição de nome, e-mail e senha chega na etapa 6.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aparência</CardTitle>
            <CardDescription>
              O tema escuro é o padrão; a preferência fica salva neste
              dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemeToggle withLabel />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="tile grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Tags className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Categorias e tags</CardTitle>
              <CardDescription>
                Organize despesas, receitas e marcadores.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Crie subcategorias, arquive categorias antigas e gerencie as tags
              usadas nos lançamentos.
            </p>
            <Button asChild variant="outline">
              <Link href="/configuracoes/categorias">
                <Tags className="h-4 w-4" />
                Gerenciar categorias e tags
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="tile grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Família</CardTitle>
              <CardDescription>
                Até 5 pessoas podem usar este Verde.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {user.isAdmin
                ? "Como administrador, você poderá criar e gerenciar os usuários da família na etapa 6."
                : "Novos usuários são criados pelo administrador do Verde."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="tile grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Database className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Dados e backup</CardTitle>
              <CardDescription>Um único arquivo SQLite.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              O banco fica em <code className="rounded bg-muted px-1">./data/verde.db</code>{" "}
              no servidor. O backup seguro com a API do SQLite está documentado
              no README.
            </p>
            <p>
              Exportação CSV/JSON, backup completo e importação de lançamentos.
            </p>
            <Button asChild variant="outline">
              <Link href="/configuracoes/dados">
                <Database className="h-4 w-4" />
                Exportar e importar dados
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessão</CardTitle>
          <CardDescription>
            Encerrar a sessão neste dispositivo. O cookie é httpOnly e assinado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              <LogOut className="h-4 w-4" />
              Sair da conta
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
