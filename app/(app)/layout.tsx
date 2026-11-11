import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast";
import { requireUser } from "@/lib/auth/current-user";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <ToastProvider>
      <AppShell
        user={{ nome: user.nome, email: user.email, isAdmin: user.isAdmin }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
