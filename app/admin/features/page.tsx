import { AdminFeaturesClient } from "@/components/admin/AdminFeaturesClient";
import { getAdminFeatureRegistry } from "@/lib/admin/features";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  await requireAdmin("settings:read");
  const registry = await getAdminFeatureRegistry();

  return <AdminFeaturesClient registry={registry} />;
}
