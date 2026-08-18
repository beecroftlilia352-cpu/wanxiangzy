import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { listAdminUsers } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/auth";
import { parseAdminListQuery } from "@/lib/admin/query";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin("users:read");
  const params = (await searchParams) || {};
  const query = parseAdminListQuery(toUrlSearchParams(params), {
    defaultPageSize: 20,
    maxPageSize: 100,
    allowedPageSizes: [20, 50, 100],
  });
  const users = await listAdminUsers({ q: query.q, page: query.page, pageSize: query.pageSize });

  return <AdminUsersClient users={users} q={query.q} page={query.page} pageSize={query.pageSize} />;
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
