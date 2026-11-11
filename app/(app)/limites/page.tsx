import { redirect } from "next/navigation";

/** Rota antiga da Etapa 1; agora a gestão vive em /limite-de-gastos. */
export default function LimitesRedirectPage() {
  redirect("/limite-de-gastos");
}
