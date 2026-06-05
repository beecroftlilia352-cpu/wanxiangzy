import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getAdminCostReport, getAdminOverview } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dayOptions = [1, 7, 14, 30];

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));
  const [overview, report] = await Promise.all([
    getAdminOverview(),
    getAdminCostReport({ days }),
  ]);

  return <AdminDashboardClient overview={overview} report={report} days={days} />;
}

function normalizeDays(value: string) {
  const parsed = Number(value);
  return dayOptions.includes(parsed) ? parsed : 7;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
