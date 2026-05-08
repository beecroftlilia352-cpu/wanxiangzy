import { NextRequest, NextResponse } from "next/server";
import { runNextGenerationJobs } from "@/lib/api/generation-jobs";
import { getConfiguredProcessorSecrets } from "@/lib/env";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handleProcessRequest(request);
}

export async function POST(request: NextRequest) {
  return handleProcessRequest(request);
}

async function handleProcessRequest(request: NextRequest) {
  const authError = validateProcessorAuth(request);
  if (authError) return authError;

  try {
    // 清理过期限流记录（异步，不阻塞主流程）
    cleanupRateLimitBuckets().catch(() => {});

    const result = await runNextGenerationJobs(getBatchLimit(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[jobs] process-generations failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "任务处理失败" },
      { status: 500 }
    );
  }
}

async function cleanupRateLimitBuckets() {
  try {
    const supabase = getAdminClient();
    await supabase.rpc("cleanup_rate_limit_buckets");
  } catch {
    // Admin client not configured, skip cleanup
  }
}

function validateProcessorAuth(request: NextRequest) {
  const secretConfig = getConfiguredProcessorSecrets(
    [
      { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
      { name: "CRON_SECRET", value: process.env.CRON_SECRET },
    ],
    "Generation job processor"
  );

  if (!secretConfig.ok) {
    return NextResponse.json(
      { error: secretConfig.message },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const isAuthorized = secretConfig.secrets.includes(token);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

function getBatchLimit(request: NextRequest) {
  const rawLimit =
    request.nextUrl.searchParams.get("limit") || process.env.GENERATION_JOB_BATCH_SIZE;
  const parsed = Number(rawLimit || 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}
