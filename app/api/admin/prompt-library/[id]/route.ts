import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { promptLibraryErrorResponse } from "@/lib/prompt-library/http";
import {
  softDeletePromptLibraryItemForAdmin,
  updatePromptLibraryItemForAdmin,
} from "@/lib/prompt-library/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

/**
 * 后台「词库管理」单条操作。
 * PATCH  更新（部分字段）
 * DELETE 软删除（写 deleted_at，不物理删除）
 * 两者都会写 admin_audit_logs：prompt_library.update / prompt_library.delete。
 */
export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("prompts:write");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const body: unknown = await request.json().catch(() => null);
    const prompt = await updatePromptLibraryItemForAdmin(getAdminClient(), id, body);

    await writeAdminAuditLog(auth.context, {
      action: "prompt_library.update",
      resourceType: "prompt_library_item",
      resourceId: prompt.id,
      reason: null,
      metadata: { title: prompt.title },
    });

    return NextResponse.json({ prompt }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return promptLibraryErrorResponse(error, "词库条目更新失败");
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("prompts:write");
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const deleted = await softDeletePromptLibraryItemForAdmin(getAdminClient(), id);

    await writeAdminAuditLog(auth.context, {
      action: "prompt_library.delete",
      resourceType: "prompt_library_item",
      resourceId: deleted.id,
      reason: null,
      metadata: {},
    });

    return NextResponse.json({ ok: true, id: deleted.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return promptLibraryErrorResponse(error, "词库条目删除失败");
  }
}
