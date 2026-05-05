import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getWorkflowBundle } from "@/lib/agent/workflow/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const bundle = await getWorkflowBundle(id, auth.user.id);
    return NextResponse.json({ ok: true, ...bundle });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "读取 workflow 失败" },
      { status: 404 }
    );
  }
}
