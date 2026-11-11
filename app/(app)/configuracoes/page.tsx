import type { Metadata } from "next";
import Link from "next/link";
import { Database, Tags, Users, Wallet, CreditCard, UserRound } from "lucide-react";
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
import { LogoutButton } from "@/components/auth/logout-button";
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
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {user.role === "admin" ? "Administrador" : "Membro"}
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
            <Button asChild variant="outline">
              <Link href="/configuracoes/perfil">
                <UserRound className="h-4 w-4" />
                Editar perfil, senha e conta
              </Link>
            </Button>
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
              <CardTitle>Usuários</CardTitle>
              <CardDescription>
                Acessos isolados por workspace.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {user.role === "admin"
                ? "Crie usuários, redefina senhas e ative/desative contas. Você não vê os dados financeiros de outros usuários."
                : "Novos usuários são criados pelo administrador do Verde."}
            </p>
            {user.role === "admin" && (
              <Button asChild variant="outline" className="mt-3">
                <Link href="/configuracoes/usuarios">
                  <Users className="h-4 w-4" />
                  Gerenciar usuários
                </Link>
              </Button>
            )}
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
          <LogoutButton className="w-auto justify-center px-4" />
        </CardContent>
      </Card>
    </div>
  );
}
