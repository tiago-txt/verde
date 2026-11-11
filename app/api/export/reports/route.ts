import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth/current-user";
import { getReportData } from "@/lib/db/queries/reports";
import { buildReportCsv } from "@/lib/finance/report-csv";
import { parseReportFilters } from "@/lib/finance/report-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseReportFilters(
    Object.fromEntries(url.searchParams.entries()),
  );
  const data = getReportData(user.workspaceId, filters);
  const csv = buildReportCsv(filters.aba, data);
  const filename = `verde-relatorio-${filters.aba}-${filters.range.from}_${filters.range.to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
