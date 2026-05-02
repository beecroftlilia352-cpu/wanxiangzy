import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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
].join(",");

const HISTORY_DETAIL_COLUMNS = [
  HISTORY_LIST_COLUMNS,
  "clothing_urls",
  "model_face_url",
  "reference_url",
  "job_payload",
].join(",");

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

type HistoryListRow = {
  created_at?: string | null;
};

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get("id");
    const supabase = await createServerSupabase();
    const userResult = await withTimeout(
      supabase.auth.getUser(),
      10000,
      "认证服务响应超时"
    );
    const user = userResult.data.user;

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: "历史记录不存在" }, { status: 404 });
      }

      return NextResponse.json({ row: data });
    }

    const cursor = searchParams.get("cursor");
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

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await withTimeout(
      query,
      15000,
      "历史记录查询超时"
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const fetchedRows = Array.isArray(data) ? data as HistoryListRow[] : [];
    const rows = fetchedRows.slice(0, pageSize);
    const hasMore = fetchedRows.length > pageSize;
    const nextCursor = hasMore ? rows[rows.length - 1]?.created_at || null : null;

    return NextResponse.json({ rows, hasMore, nextCursor });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "历史记录加载失败";
    console.error("[history] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
