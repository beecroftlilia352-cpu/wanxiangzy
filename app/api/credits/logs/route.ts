import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const CREDIT_LOG_FIELDS = [
  "id",
  "amount",
  "balance",
  "reason",
  "generation_id",
  "created_at",
].join(",");

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("credit_logs")
      .select(CREDIT_LOG_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data ?? [] });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[credits/logs] error:", error);
    }
    return NextResponse.json({ error: "积分记录加载失败" }, { status: 500 });
  }
}
