import { AdminShowcaseExamplesClient } from "@/components/admin/AdminShowcaseExamplesClient";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";
import { SHOWCASE_MODULES } from "@/lib/showcase-examples";

export const dynamic = "force-dynamic";

export default async function AdminShowcasePage() {
  const admin = await requireAdmin("assets:read");
  const registries = await Promise.all(SHOWCASE_MODULES.map((module) => getStudioShowcaseRegistry(module)));
  return <AdminShowcaseExamplesClient registries={registries} canManage={hasAdminPermission(admin.role, "assets:write")} />;
}
