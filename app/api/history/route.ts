import { isRecord, withTimeout, toLogMessage } from "@/lib/utils";
import { NextResponse } from "next/server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  GENERATION_COMPLETED_STATUS_FILTERS,
  GENERATION_FAILED_STATUS_FILTERS,
  GENERATION_PENDING_STATUS_FILTERS,
  GENERATION_PROCESSING_STATUS_FILTERS,
  normalizeGenerationState,
} from "@/lib/api/generation-state";

const HISTORY_LIST_COLUMNS = [
  "id",
  "status",
  "error_message",
  "credits_cost",
  "credits_used",
  "ai_model",
  "image_size",
  "result_urls",
  "created_at",
  "completed_at",
  "job_payload",
].join(",");

const HISTORY_DETAIL_COLUMNS = [
  HISTORY_LIST_COLUMNS,
  "clothing_urls",
  "model_face_url",
  "reference_url",
].join(",");

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;
const READ_RATE_LIMIT_TIMEOUT_MS = 1_500;
const HISTORY_MODULE_FILTERS = new Set([
  "tryon",
  "grass",
  "productSet",
  "modelBackground",
  "generalImage",
  "outfitFusion",
  "pose",
  "model",
  "garment3d",
  "faceSwap",
  "videoImageToVideo",
  "videoMotion",
  "videoFirstLastFrame",
]);
const HISTORY_STATUS_FILTERS: Record<string, string[]> = {
  completed: [...GENERATION_COMPLETED_STATUS_FILTERS],
  processing: [...GENERATION_PROCESSING_STATUS_FILTERS],
  pending: [...GENERATION_PENDING_STATUS_FILTERS],
  failed: [...GENERATION_FAILED_STATUS_FILTERS],
};

type HistoryListRow = {
  id?: string | null;
  status?: string | null;
  result_urls?: string[] | null;
  completed_at?: string | null;
  job_payload?: Record<string, unknown> | null;
  created_at?: string | null;
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get("id");
    const supabase = await createServerSupabase({ readonlyCookies: true });
    const userResult = await withTimeout(
      supabase.auth.getUser(),
      10000,
      "认证服务响应超时"
    );
    const user = userResult.data.user;

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const rateLimit = await safeEnforceReadRateLimit(user.id);
    if (rateLimit) return rateLimit;

    if (id) {
      const { data, error } = await withTimeout(
        supabase
          .from("generations")
          .select(HISTORY_DETAIL_COLUMNS)
          .eq("user_id", user.id)
          .eq("id", id)
          .maybeSingle(),
        30000,
        "历史详情查询超时"
      );

      if (error) {
        console.warn("[history] detail query unavailable:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: "历史记录不存在" }, { status: 404 });
      }
      if (isHiddenByAdmin(data as HistoryListRow)) {
        return NextResponse.json({ error: "历史记录已下架" }, { status: 404 });
      }

      return NextResponse.json({ row: normalizeHistoryRow(data as HistoryListRow) });
    }

    const cursor = searchParams.get("cursor");
    const moduleFilter = normalizeModuleFilter(searchParams.get("module"));
    const statusFilter = normalizeStatusFilter(searchParams.get("status"));
    const requestedLimit = Number(searchParams.get("limit"));
    const pageSize = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

    let query = supabase
      .from("generations")
      .select(HISTORY_LIST_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(pageSize + 1);

    if (moduleFilter) {
      query = query.eq("job_payload->>kind", moduleFilter);
    }

    if (statusFilter) {
      query = query.in("status", HISTORY_STATUS_FILTERS[statusFilter]);
    }

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await withTimeout(
      query,
      15000,
      "历史记录查询超时"
    );

    if (error) {
      console.warn("[history] list query unavailable:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const fetchedRows = Array.isArray(data) ? data as HistoryListRow[] : [];
    const visibleRows = fetchedRows.filter((row) => !isHiddenByAdmin(row));
    const rows = visibleRows.slice(0, pageSize).map(normalizeHistoryRow);
    const hasMore = fetchedRows.length > pageSize;
    const nextCursor = hasMore ? rows[rows.length - 1]?.created_at || null : null;

    return NextResponse.json(
      { rows, hasMore, nextCursor },
      {
        headers: {
          "Cache-Control": "private, max-age=5, stale-while-revalidate=10",
        },
      }
    );
  } catch (err: unknown) {
    console.error("[history] error:", toLogMessage(err));
    return NextResponse.json({ error: "历史记录加载失败" }, { status: 500 });
  }
}

async function safeEnforceReadRateLimit(userId: string) {
  try {
    return await withTimeout(
      enforceApiRateLimit(userId, API_RATE_LIMITS.historyRead),
      READ_RATE_LIMIT_TIMEOUT_MS,
      "rate limit timeout"
    );
  } catch (error) {
    console.warn("[history] rate limit unavailable:", toLogMessage(error));
    return null;
  }
}

function normalizeModuleFilter(value: string | null) {
  return value && HISTORY_MODULE_FILTERS.has(value) ? value : null;
}

function normalizeStatusFilter(value: string | null) {
  return value && Object.prototype.hasOwnProperty.call(HISTORY_STATUS_FILTERS, value) ? value : null;
}

function normalizeHistoryRow<T extends HistoryListRow>(row: T): T {
  const state = normalizeGenerationState({
    status: row.status,
    resultUrls: row.result_urls,
    payload: row.job_payload,
    completedAt: row.completed_at,
  });

  return {
    ...row,
    status: state.status,
    completed_at: row.completed_at || state.completedAt || null,
    progress: state.progress,
  } as T;
}

function isHiddenByAdmin(row: HistoryListRow) {
  const moderation = isRecord(row.job_payload?.adminModeration) ? row.job_payload.adminModeration : null;
  return moderation?.action === "hide";
}
