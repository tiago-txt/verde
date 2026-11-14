import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ShieldAlert } from "lucide-react";
import { UsersSettings } from "@/components/settings/users-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminRole } from "@/lib/auth/current-user";
import { getAdminNetworkAccess } from "@/lib/auth/admin-access";
import { listUsersForAdmin } from "@/lib/db/queries/users";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const admin = await requireAdminRole();
  const access = await getAdminNetworkAccess();

  if (!access.allowed) {
    return (
      <div className="space-y-3">
        <Link
          href="/configuracoes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Configurações
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Gerenciamento de contas e senhas.
          </p>
        </div>
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <span className="tile grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <CardTitle>Acesso restrito à rede local</CardTitle>
              <CardDescription>
                O painel de usuários só pode ser aberto pela rede local ou por
                IPs autorizados. O restante do Verde continua disponível.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              IP detectado:{" "}
              <code className="rounded bg-muted px-1">
                {access.ip ?? "desconhecido"}
              </code>
            </p>
            <p>
              Redes autorizadas:{" "}
              <code className="break-all rounded bg-muted px-1">
                {access.networks.join(", ")}
              </code>
            </p>
            <p>
              Para liberar outro IP, ajuste{" "}
              <code className="rounded bg-muted px-1">
                ADMIN_TRUSTED_NETWORKS
              </code>{" "}
              no servidor e reinicie o container.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const users = listUsersForAdmin();

  return (
    <div className="space-y-3">
      <Link
        href="/configuracoes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Configurações
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          Crie acessos, redefina senhas e ative/desative contas. Cada usuário vê
          apenas os próprios dados financeiros.
        </p>
      </div>
      <UsersSettings users={users} currentUserId={admin.id} />
    </div>
  );
}
