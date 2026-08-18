import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { listAdminUsers } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireAdmin("users:read");
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const users = await listAdminUsers({ q, limit: q ? 50 : 30 });

  return <AdminUsersClient users={users} q={q} />;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
