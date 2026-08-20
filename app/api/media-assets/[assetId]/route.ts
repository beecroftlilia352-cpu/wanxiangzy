import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { createAliyunOssRegistryReadUrl } from "@/lib/api/media-storage";
import { resolveVerifiedMediaAssetForViewer } from "@/lib/api/media-asset-viewer.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ assetId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { supabase, user, response } = await requireApiUser();
  if (!user) return response;
  const { assetId } = await params;
  const filename = new URL(request.url).searchParams.get("filename") || undefined;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
    return NextResponse.json({ error: "无效的媒体资产 ID" }, { status: 400 });
  }

  const { data: record, error: recordError } = await supabase
    .from("media_asset_records")
    .select("id,status")
    .eq("id", assetId)
    .maybeSingle();
  if (recordError && recordError.code !== "PGRST116") {
    return NextResponse.json({ error: "媒体资产不存在" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const wantsStatus = new URL(request.url).searchParams.get("status") === "1";
  if (record && record.status !== "verified") {
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
    if (!record) {
      return NextResponse.json({ error: "媒体资产不存在" }, {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    return NextResponse.json({
      media_asset_id: assetId,
      status: "verified",
      url: `/api/media-assets/${assetId}`,
      display_url: `/api/media-assets/${assetId}`,
      delete_url: "",
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const resolved = await resolveVerifiedMediaAssetForViewer(assetId, user.id);
  if (!resolved) {
    return NextResponse.json({ error: "媒体资产不存在或尚未完成安全校验" }, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    return NextResponse.redirect(
      createAliyunOssRegistryReadUrl(resolved.objectKey, resolved.bucketName, filename),
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
