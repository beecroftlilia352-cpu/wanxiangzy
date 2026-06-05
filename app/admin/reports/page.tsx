import { AdminReportsClient } from "@/components/admin/AdminReportsClient";
import { getAdminCostReport } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dayOptions = [7, 14, 30, 90];

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));
  const report = await getAdminCostReport({ days });

  return <AdminReportsClient report={report} />;
}

function normalizeDays(value: string) {
  const parsed = Number(value);
  return dayOptions.includes(parsed) ? parsed : 14;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
