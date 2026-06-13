// Agent module is temporarily disabled. The agent-workflows and agent-evals
// targets here are no-ops; only `generations` runs the real worker.
// The full agent worker implementation lives on the
// `refactor/extract-agent-module` branch.

import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { runNextGenerationJobs } from "@/lib/api/generation-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type WorkerTarget = "generations" | "agent-workflows" | "agent-evals";

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
    return NextResponse.json({ error: "target 必须是 generations、agent-workflows 或 agent-evals" }, { status: 400 });
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
  if (target === "generations") {
    return runNextGenerationJobs(limit);
  }
  // agent-workflows and agent-evals are disabled while the agent module
  // is archived on `refactor/extract-agent-module`.
  return { disabled: "agent module disabled", processed: 0, succeeded: 0, failed: 0, skipped: 0 };
}

function normalizeTarget(value: unknown): WorkerTarget | null {
  return value === "generations" || value === "agent-workflows" || value === "agent-evals"
    ? value
    : null;
}

function clampRunLimit(value: unknown, target: WorkerTarget | null) {
  const max = target === "agent-evals" ? 100 : 10;
  const fallback = target === "agent-evals" ? 20 : 2;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.floor(parsed)));
}
