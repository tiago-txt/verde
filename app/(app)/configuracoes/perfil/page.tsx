import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DeleteAccountSettings,
  PasswordSettings,
  ProfileSettings,
} from "@/components/settings/profile-settings";
import { requireUser } from "@/lib/auth/current-user";

export const metadata: Metadata = { title: "Perfil e segurança" };

export default async function PerfilPage() {
  const user = await requireUser();

  return (
    <div className="space-y-3">
      <Link
        href="/configuracoes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Configurações
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">Perfil e segurança</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>Nome e e-mail usados no login.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileSettings nome={user.nome} email={user.email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Senha</CardTitle>
            <CardDescription>
              Troque sua senha quando quiser. Mínimo de 10 caracteres, com letras
              e números.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordSettings />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Excluir minha conta</CardTitle>
            <CardDescription>
              Remove seu workspace e todos os dados financeiros dele. Não há
              como desfazer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountSettings />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
