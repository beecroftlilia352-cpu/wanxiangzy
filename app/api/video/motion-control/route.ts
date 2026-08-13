import { NextRequest, NextResponse } from "next/server";
import { handleGenerationStatusGet } from "@/lib/api/generation-status";

export const maxDuration = 60;

export async function POST(_request: NextRequest) {
  // Reference-video motion control is not available through the new.bi
  // gateway for any configured video provider (MiniMax H3 / Seedance 2.0).
  return NextResponse.json(
    { error: "当前视频供应商暂不支持参考视频动作模仿，请使用图生视频或首尾帧功能。" },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  return handleGenerationStatusGet(request.nextUrl.searchParams.get("generation_id"));
}
