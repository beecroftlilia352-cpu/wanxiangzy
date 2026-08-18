import { AdminFeaturesClient } from "@/components/admin/AdminFeaturesClient";
import { getAdminFeatureRegistry } from "@/lib/admin/features";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminFeaturesPage() {
  const admin = await requireAdmin("settings:read");
  const registry = await getAdminFeatureRegistry();

  return <AdminFeaturesClient registry={registry} canManage={hasAdminPermission(admin.role, "settings:write")} />;
}
