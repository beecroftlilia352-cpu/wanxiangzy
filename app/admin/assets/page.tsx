import { AdminAssetsClient } from "@/components/admin/AdminAssetsClient";
import { listAdminAssets } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAssetsPage({ searchParams }: PageProps) {
  const admin = await requireAdmin("assets:read");
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const moduleFilter = getSearchParam(params.module);
  const assets = await listAdminAssets({ q, module: moduleFilter, limit: q || moduleFilter ? 60 : 40 });

  return <AdminAssetsClient assets={assets} q={q} module={moduleFilter} canManage={hasAdminPermission(admin.role, "assets:write")} />;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
