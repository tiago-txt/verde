import type { Metadata } from "next";
import { CategoryManager } from "@/components/categories/category-manager";
import { requireUser } from "@/lib/auth/current-user";
import {
  listCategoriesWithCounts,
  listTagsWithCounts,
} from "@/lib/db/queries/categories";

export const metadata: Metadata = { title: "Categorias e tags" };

export default async function CategoriasPage() {
  const user = await requireUser();

  const categories = listCategoriesWithCounts(user.workspaceId);
  const tags = listTagsWithCounts(user.workspaceId);

  return <CategoryManager categories={categories} tags={tags} />;
}
