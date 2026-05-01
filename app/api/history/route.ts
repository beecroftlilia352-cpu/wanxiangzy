import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
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

    const { data, error } = await withTimeout(
      supabase
        .from("generations")
        .select("id,status,error_message,credits_cost,credits_used,ai_model,image_size,result_urls,created_at,completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      15000,
      "历史记录查询超时"
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data || [] });
  } catch (err: any) {
    console.error("[history] error:", err);
    return NextResponse.json({ error: err.message || "历史记录加载失败" }, { status: 500 });
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
