import { AdminPromptLibraryClient } from "@/components/admin/AdminPromptLibraryClient";
import { requireAdmin } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export default async function AdminPromptLibraryPage() {
  const admin = await requireAdmin("prompts:read");

  return <AdminPromptLibraryClient canManage={hasAdminPermission(admin.role, "prompts:write")} />;
}
