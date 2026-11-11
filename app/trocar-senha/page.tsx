import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { LogoutButton } from "@/components/auth/logout-button";
import { PasswordSettings } from "@/components/settings/profile-settings";
import { requireSessionUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Trocar senha",
  robots: { index: false, follow: false },
};

export default async function TrocarSenhaPage() {
  const user = await requireSessionUser();
  if (!user.mustChangePassword) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <Brand />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Defina uma nova senha
          </h1>
          <p className="text-sm text-muted-foreground">
            Este é seu primeiro acesso (ou sua senha foi redefinida). Para
            continuar, troque a senha temporária por uma senha só sua.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <PasswordSettings forced />
        </div>
        <LogoutButton className="justify-center" />
      </div>
    </main>
  );
}
