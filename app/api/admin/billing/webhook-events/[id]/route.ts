import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminApi("billing:read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "事件 ID 不能为空" }, { status: 400 });

  const { data, error } = await getAdminClient()
    .from("stripe_webhook_events")
    .select("*")
    .eq("event_id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "事件不存在" }, { status: 404 });

  return NextResponse.json(
    { event: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
