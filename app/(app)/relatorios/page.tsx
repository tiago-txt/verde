import type { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { listCardsForFilter } from "@/lib/db/queries/cards";
import { listAllCategories, listTags } from "@/lib/db/queries/categories";
import { getReportData } from "@/lib/db/queries/reports";
import { parseReportFilters } from "@/lib/finance/report-filters";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const filters = parseReportFilters(params);
  const data = getReportData(filters);

  return (
    <ReportsView
      filters={filters}
      categoryReport={data.categoryReport}
      monthlySeries={data.monthlySeries}
      monthlyCategorySeries={data.monthlyCategorySeries}
      originReport={data.originReport}
      totals={data.totals}
      previousRange={data.previousRange}
      accounts={listAllAccounts()}
      cards={listCardsForFilter()}
      categories={listAllCategories()}
      tags={listTags()}
    />
  );
}
