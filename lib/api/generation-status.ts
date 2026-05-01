import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * 公共 GET 轮询：查询 generation 状态
 * 供 tryon / model / pose / garment-3d 四个路由复用
 */
export async function handleGenerationStatusGet(generationId: string | null) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    if (!generationId) {
      return NextResponse.json({ error: "Missing generation_id" }, { status: 400 });
    }

    const { data: gen } = await supabase
      .from("generations")
      .select("status,result_urls,error_message")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      status: gen.status,
      result_urls: gen.result_urls || [],
      error: gen.error_message,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
