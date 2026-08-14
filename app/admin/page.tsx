import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getAdminOverview } from "@/lib/admin/data";
import type { AdminOverview } from "@/lib/admin/data";

export const dynamic = "force-dynamic";
export const revalidate = 30;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dayOptions = [1, 7, 14, 30];

const EMPTY_OVERVIEW: AdminOverview = {
  metrics: [],
  taskHealth: { queued: 0, running: 0, completed: 0, failed: 0 },
  generationHealth: { total: 0, today: 0, queued: 0, running: 0, completed: 0, failed: 0, failureRate: 0 },
  creditHealth: { sampledBalance: 0, sampledConsumed: 0, recentSpend: 0, recentRefund: 0 },
  moduleStats: [],
  modelStats: [],
  recentTasks: [],
  warnings: [],
};

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));

  let overview: AdminOverview = EMPTY_OVERVIEW;
  let fetchError: string | null = null;

  try {
    overview = await getAdminOverview({ days });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "运营数据加载失败";
    console.error("[admin dashboard] overview fetch failed:", err);
  }

  return (
    <AdminDashboardClient
      overview={overview}
      days={days}
      fetchError={fetchError}
    />
  );
}

function normalizeDays(value: string) {
  const parsed = Number(value);
  return dayOptions.includes(parsed) ? parsed : 7;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
