import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin("admin:read");

  return (
    <AdminShell admin={{ email: admin.email, role: admin.role, source: admin.source }}>
      {children}
    </AdminShell>
  );
}
