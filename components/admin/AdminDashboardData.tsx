import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";
import { getAdminOverview } from "@/lib/admin/data";
import type { AdminOverview } from "@/lib/admin/data";

const EMPTY_OVERVIEW: AdminOverview = {
  metrics: [],
  taskHealth: { queued: 0, running: 0, completed: 0, failed: 0 },
  generationHealth: { total: 0, today: 0, queued: 0, running: 0, completed: 0, failed: 0, failureRate: 0 },
  creditHealth: { sampledBalance: 0, sampledConsumed: 0, recentSpend: 0, recentRefund: 0 },
  pendingApprovals: 0,
  dailyStats: [],
  moduleStats: [],
  modelStats: [],
  recentTasks: [],
  warnings: [],
};

/** 服务端数据组件：Suspense 流式渲染的数据源 */
export async function AdminDashboardData({ days }: { days: number }) {
  let overview: AdminOverview = EMPTY_OVERVIEW;
  let fetchError: string | null = null;

  try {
    overview = await getAdminOverview({ days });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "运营数据加载失败";
    console.error("[admin dashboard] overview fetch failed:", err);
  }

  return <AdminDashboardClient overview={overview} days={days} fetchError={fetchError} />;
}
