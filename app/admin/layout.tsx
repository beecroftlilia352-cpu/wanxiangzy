import "@/app/styles/admin.css";
import { AdminUIProvider } from "@/components/admin/AdminUIProvider";
import { AdminShell } from "@/components/admin/AdminShell";
import { requireAdmin } from "@/lib/admin/auth";
import { countPendingOperationRequests } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin("admin:read");
  const pendingApprovals = await countPendingOperationRequests().catch(() => 0);

  return (
    <AdminUIProvider>
      <AdminShell admin={{ email: admin.email, role: admin.role, source: admin.source }} pendingApprovals={pendingApprovals}>
        {children}
      </AdminShell>
    </AdminUIProvider>
  );
}
