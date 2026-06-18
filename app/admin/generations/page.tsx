import { AdminTasksClient } from "@/components/admin/AdminTasksClient";
import { listAdminTasks } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";

export const dynamic = "force-dynamic";
const TASK_PAGE_SIZE_OPTIONS = [20, 50] as const;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminGenerationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const query = parseAdminListQuery(toUrlSearchParams(params), {
    defaultPageSize: 20,
    minPageSize: 20,
    maxPageSize: 100,
    allowedPageSizes: TASK_PAGE_SIZE_OPTIONS,
    allowedSorts: ["createdAt", "updatedAt", "status", "module"],
  });
  const stale = getSearchParam(params.stale) === "1";
  const tasks = await listAdminTasks({
    q: query.q,
    status: query.status,
    module: query.module,
    stale,
    page: query.page,
    pageSize: query.pageSize,
    hydratePreviews: false,
  });

  return (
    <AdminTasksClient
      tasks={tasks}
      q={query.q}
      status={query.status}
      module={query.module}
      stale={stale}
      page={query.page}
      pageSize={query.pageSize}
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
