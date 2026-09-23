import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { promptLibraryErrorResponse } from "@/lib/prompt-library/http";
import {
  createPromptLibraryItemForAdmin,
  listPromptLibraryItemsForAdmin,
  parsePromptLibraryAdminListQuery,
} from "@/lib/prompt-library/server";

/**
 * 后台「词库管理」接口（运营控制台 / 内容与风控）。
 *
 * 读权限：prompts:read；写权限：prompts:write（lib/admin/permissions.ts 中既有权限）。
 * 全部走 service role（绕过 RLS），因此读写范围不受 prompt_library_items 的 RLS 限制；
 * 增/删/改都会写 public.admin_audit_logs。
 *
 * GET  ?q=&page=&pageSize=&includeDeleted=
 * POST 新建条目
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi("prompts:read");
  if (!auth.ok) return auth.response;

  try {
    const query = parsePromptLibraryAdminListQuery(new URL(request.url).searchParams);
    const result = await listPromptLibraryItemsForAdmin(getAdminClient(), query);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return promptLibraryErrorResponse(error, "词库列表加载失败");
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("prompts:write");
  if (!auth.ok) return auth.response;

  try {
    const body: unknown = await request.json().catch(() => null);
    const prompt = await createPromptLibraryItemForAdmin(
      getAdminClient(),
      body,
      { userId: auth.context.userId, email: auth.context.email },
    );

    await writeAdminAuditLog(auth.context, {
      action: "prompt_library.create",
      resourceType: "prompt_library_item",
      resourceId: prompt.id,
      reason: null,
      metadata: { title: prompt.title, creationType: prompt.creationType },
    });

    return NextResponse.json({ prompt }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return promptLibraryErrorResponse(error, "词库条目创建失败");
  }
}
