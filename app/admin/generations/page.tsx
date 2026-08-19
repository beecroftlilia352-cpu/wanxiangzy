import { AdminTasksClient } from "@/components/admin/AdminTasksClient";
import { listAdminTasks } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";
import type { AdminTaskList } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 15;
const TASK_PAGE_SIZE_OPTIONS = [20, 50] as const;

const EMPTY_TASKS: AdminTaskList = {
  rows: [],
  total: 0,
  source: "task_queue_items",
  warnings: ["数据加载失败，请刷新重试"],
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminGenerationsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin("tasks:read");
  const params = (await searchParams) || {};
  const query = parseAdminListQuery(toUrlSearchParams(params), {
    defaultPageSize: 20,
    minPageSize: 20,
    maxPageSize: 100,
    allowedPageSizes: TASK_PAGE_SIZE_OPTIONS,
    allowedSorts: ["createdAt", "updatedAt", "status", "module"],
  });
  const staleVal = getSearchParam(params.stale) === "1";

  let tasks: AdminTaskList = EMPTY_TASKS;
  let fetchError: string | null = null;

  try {
    tasks = await listAdminTasks({
      q: query.q,
      status: query.status,
      module: query.module,
      stale: staleVal,
      page: query.page,
      pageSize: query.pageSize,
      hydratePreviews: false,
      estimatedCount: true,
    });
  } catch (err) {
    fetchError = err instanceof Error ? err.message : "任务列表加载失败";
    console.error("[admin generations] fetch failed:", err);
  }

  return (
    <AdminTasksClient
      tasks={tasks}
      q={query.q}
      status={query.status}
      module={query.module}
      stale={staleVal}
      page={query.page}
      pageSize={query.pageSize}
      fetchError={fetchError}
      canOperate={hasAdminPermission(admin.role, "tasks:operate")}
    />
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function toUrlSearchParams(params: Record<string, string | string[] | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }
    if (value) searchParams.set(key, value);
  });
  return searchParams;
}
