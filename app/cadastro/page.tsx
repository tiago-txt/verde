import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignupForm } from "@/components/auth/signup-form";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Criar conta",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CadastroPage() {
  if (process.env.ALLOW_SIGNUP !== "true") notFound();

  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <Brand />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Criar sua conta
          </h1>
          <p className="text-sm text-muted-foreground">
            Você terá um espaço próprio, com categorias padrão e sem acesso aos
            dados de outros usuários.
          </p>
        </div>
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
