import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WorkerTarget = "generations";

export async function POST(request: Request) {
  const auth = await requireAdminApi("workers:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    target?: unknown;
    limit?: unknown;
    reason?: unknown;
  };
  const target = normalizeTarget(body.target);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const limit = clampRunLimit(body.limit, target);

  if (!target) {
    return NextResponse.json({ error: "target 必须是 generations" }, { status: 400 });
  }
  if (reason.length < 6) {
    return NextResponse.json({ error: "请填写至少 6 个字符的触发原因" }, { status: 400 });
  }

  try {
    const result = await runWorker(target, limit);
    await writeAdminAuditLog(auth.context, {
      action: `worker.run.${target}`,
      resourceType: "worker",
      resourceId: target,
      reason,
      metadata: { target, limit, result },
    });

    return NextResponse.json({ ok: true, target, limit, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await writeAdminAuditLog(auth.context, {
      action: `worker.run.${target}.failed`,
      resourceType: "worker",
      resourceId: target,
      reason,
      metadata: { target, limit, error: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "worker 触发失败" },
      { status: 500 },
    );
  }
}

async function runWorker(target: WorkerTarget, limit: number) {
  const admin = getAdminClient();
  const recovery = await admin.rpc("recover_generation_outbox", { p_limit: limit });
  if (recovery.error) throw new Error(`Outbox recovery failed: ${recovery.error.message}`);
  const health = await admin.rpc("get_generation_queue_health");
  if (health.error) throw new Error(`Queue health read failed: ${health.error.message}`);
  return {
    action: "outbox-recovery",
    executedBusinessJobs: 0,
    recovery: firstRow(recovery.data),
    health: firstRow(health.data),
  };
}

function normalizeTarget(value: unknown): WorkerTarget | null {
  return value === "generations" ? value : null;
}

function clampRunLimit(value: unknown, target: WorkerTarget | null) {
  const max = target === "generations" ? 1_000 : 100;
  const fallback = 100;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}

function firstRow(value: unknown) {
  return Array.isArray(value) ? value[0] ?? null : value;
}
