import { AdminAssetsClient } from "@/components/admin/AdminAssetsClient";
import { listAdminAssets } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAssetsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const module = getSearchParam(params.module);
  const assets = await listAdminAssets({ q, module, limit: 80 });

  return <AdminAssetsClient assets={assets} q={q} module={module} />;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
