import { AdminModelControlPlane } from "@/components/admin/AdminModelControlPlane";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const admin = await requireAdmin("providers:read");
  return <AdminModelControlPlane canManage={hasAdminPermission(admin.role, "providers:write")} />;
}
