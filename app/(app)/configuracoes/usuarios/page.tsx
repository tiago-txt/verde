import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { UsersSettings } from "@/components/settings/users-settings";
import { requireAdmin } from "@/lib/auth/current-user";
import { listUsersForAdmin } from "@/lib/db/queries/users";

export const metadata: Metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  const admin = await requireAdmin();
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
