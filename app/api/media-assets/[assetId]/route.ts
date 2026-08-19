import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { createAliyunOssRegistryReadUrl } from "@/lib/api/media-storage";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, user, response } = await requireApiUser();
  if (!user) return response;
  const { assetId } = await params;
  const filename = new URL(request.url).searchParams.get("filename") || undefined;
  const variant = new URL(request.url).searchParams.get("variant") || undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    return NextResponse.json({ error: "无效的媒体资产 ID" }, { status: 400 });
  }

  const { data: record, error: recordError } = await supabase
    .from("media_asset_records")
    .select("id,status")
    .eq("id", assetId)
    .maybeSingle();
  if (recordError || !record) {
    return NextResponse.json({ error: "媒体资产不存在" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const wantsStatus = new URL(request.url).searchParams.get("status") === "1";
  if (record.status !== "verified") {
    const terminal = record.status === "quarantined" || record.status === "deleted";
    return NextResponse.json({
      media_asset_id: assetId,
      status: record.status === "uploaded" ? "pending_validation" : record.status,
    }, {
      status: terminal ? 422 : 202,
      headers: terminal
        ? { "Cache-Control": "private, no-store" }
        : { "Cache-Control": "private, no-store", "Retry-After": "2" },
    });
  }
  if (wantsStatus) {
    return NextResponse.json({
      media_asset_id: assetId,
      status: "verified",
      url: `/api/media-assets/${assetId}`,
      display_url: `/api/media-assets/${assetId}`,
      delete_url: "",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { data, error } = await getAdminClient().rpc(
    "resolve_verified_media_asset_for_worker",
    {
      p_asset_id: assetId,
      p_expected_owner_user_id: user.id,
    },
  );
  const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as { bucket_name?: unknown; object_key?: unknown }
    : null;
  if (
    error
    || !row
    || typeof row.bucket_name !== "string"
    || typeof row.object_key !== "string"
  ) {
    return NextResponse.json({ error: "媒体资产不存在或尚未完成安全校验" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    return NextResponse.redirect(
      createAliyunOssRegistryReadUrl(row.object_key, row.bucket_name, filename, variant),
      {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
      },
    );
  } catch {
    return NextResponse.json({ error: "媒体读取服务暂不可用" }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store", "Retry-After": "5" },
    });
  }
}
