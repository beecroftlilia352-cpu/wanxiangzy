import { getAdminClient } from "@/lib/supabase/admin";
import type { AdminContext } from "@/lib/admin/auth";

type AdminAuditInput = {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAdminAuditLog(context: AdminContext, input: AdminAuditInput) {
  try {
    const { error } = await getAdminClient().from("admin_audit_logs").insert({
      actor_user_id: context.userId,
      actor_email: context.email,
      actor_role: context.role,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId || null,
      reason: input.reason || null,
      metadata: input.metadata || {},
    });

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[admin/audit] write failed:", error.message);
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[admin/audit] write unavailable:", error);
    }
  }
}
