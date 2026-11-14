import type { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { listCardsForFilter } from "@/lib/db/queries/cards";
import { listAllCategories, listTags } from "@/lib/db/queries/categories";
import { getReportData } from "@/lib/db/queries/reports";
import { getCardBasis } from "@/lib/db/queries/finance-preferences";
import { parseReportFilters } from "@/lib/finance/report-filters";

export const metadata: Metadata = { title: "Relatórios" };

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const params = await searchParams;
  const filters = parseReportFilters(params);
  const basis = getCardBasis(user.workspaceId, user.id);
  const data = getReportData(user.workspaceId, filters, basis);

  return (
    <ReportsView
      filters={filters}
      cardBasis={basis}
      categoryReport={data.categoryReport}
      monthlySeries={data.monthlySeries}
      monthlyCategorySeries={data.monthlyCategorySeries}
      originReport={data.originReport}
      totals={data.totals}
      previousRange={data.previousRange}
      accounts={listAllAccounts(user.workspaceId)}
      cards={listCardsForFilter(user.workspaceId)}
      categories={listAllCategories(user.workspaceId)}
      tags={listTags(user.workspaceId)}
    />
  );
}
