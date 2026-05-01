import { NextRequest, NextResponse } from "next/server";
import { runNextGenerationJobs } from "@/lib/api/generation-jobs";

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

function validateProcessorAuth(request: NextRequest) {
  const expectedSecret = process.env.JOB_PROCESSOR_SECRET || process.env.CRON_SECRET;

  if (!expectedSecret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "JOB_PROCESSOR_SECRET 或 CRON_SECRET 未配置" },
        { status: 500 }
      );
    }
    return null;
  }

  const authorization = request.headers.get("authorization") || "";
  const isAuthorized = authorization === `Bearer ${expectedSecret}`;

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
