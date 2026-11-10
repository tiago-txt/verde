import type { Metadata } from "next";
import { CategoryManager } from "@/components/categories/category-manager";
import { requireUser } from "@/lib/auth/current-user";
import {
  listCategoriesWithCounts,
  listTagsWithCounts,
} from "@/lib/db/queries/categories";

export const metadata: Metadata = { title: "Categorias e tags" };

export default async function CategoriasPage() {
  await requireUser();

  const categories = listCategoriesWithCounts();
  const tags = listTagsWithCounts();

  return <CategoryManager categories={categories} tags={tags} />;
}
