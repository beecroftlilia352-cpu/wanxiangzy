import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

export async function GET() {
  const { supabase, user, response } = await requireApiUser();
  if (response || !user) return response;
  const { data, error } = await supabase
    .from("ai_user_routing_preferences")
    .select("routing_mode,allow_cross_model_fallback,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error && !isMissingTable(error)) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    ok: true,
    routingMode: data?.routing_mode === "smart" ? "smart" : "stable",
    // Cross-model substitution remains server-disabled until a dedicated
    // capability/price consent contract is exposed to the customer.
    allowCrossModelFallback: false,
    updatedAt: data?.updated_at || null,
    available: !error,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  const { supabase, user, response } = await requireApiUser();
  if (response || !user) return response;
  const body = await request.json().catch(() => ({})) as { routingMode?: unknown; allowCrossModelFallback?: unknown };
  const routingMode = body.routingMode === "smart" ? "smart" : body.routingMode === "stable" ? "stable" : null;
  if (!routingMode) return NextResponse.json({ error: "routingMode 必须是 stable 或 smart" }, { status: 400 });
  if (body.allowCrossModelFallback === true) {
    return NextResponse.json({ error: "跨模型替换尚未开放；智能路由只会切换同一模型的供应商" }, { status: 400 });
  }
  const { data, error } = await supabase.from("ai_user_routing_preferences").upsert({
    user_id: user.id,
    routing_mode: routingMode,
    allow_cross_model_fallback: false,
  }, { onConflict: "user_id" }).select("routing_mode,allow_cross_model_fallback,updated_at").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    ok: true,
    routingMode: data.routing_mode,
    allowCrossModelFallback: data.allow_cross_model_fallback,
    updatedAt: data.updated_at,
  }, { headers: { "Cache-Control": "no-store" } });
}

function isMissingTable(error: { code?: string; message?: string }) {
  return `${error.code || ""} ${error.message || ""}`.toLowerCase().includes("ai_user_routing_preferences");
}
