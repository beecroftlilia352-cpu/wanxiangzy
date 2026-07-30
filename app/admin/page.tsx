import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getAdminCostReport, getAdminOverview } from "@/lib/admin/data";
import type { AdminOverview, AdminCostReport } from "@/lib/admin/data";

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

const EMPTY_REPORT: AdminCostReport = {
  daily: [],
  breakdown: [],
  totals: { totalCost: 0, totalCount: 0 },
  warnings: [],
};

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));

  let overview: AdminOverview = EMPTY_OVERVIEW;
  let report: AdminCostReport = EMPTY_REPORT;
  let fetchError: string | null = null;

  try {
    const results = await Promise.allSettled([
      getAdminOverview({ days }),
      getAdminCostReport({ days }),
    ]);

    if (results[0].status === "fulfilled") {
      overview = results[0].value;
    } else {
      fetchError = results[0].reason instanceof Error ? results[0].reason.message : "运营数据加载失败";
      console.error("[admin dashboard] overview fetch failed:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      report = results[1].value;
    } else {
      console.error("[admin dashboard] report fetch failed:", results[1].reason);
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "管理后台数据加载异常";
    console.error("[admin dashboard] unexpected error:", err);
  }

  return (
    <AdminDashboardClient
      overview={overview}
      report={report}
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
