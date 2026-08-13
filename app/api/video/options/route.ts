import { NextResponse } from "next/server";
import { supportsVideoMotionControl } from "@/lib/api/video-catalog";
import { getAdminVideoProviderOverride } from "@/lib/api/video-provider-registry.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const override = await getAdminVideoProviderOverride();
  if (!override || override.enabled === false || !override.apiKey) {
    return NextResponse.json(
      { enabled: false, provider: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      enabled: true,
      provider: override.provider,
      supportsMotionControl: supportsVideoMotionControl(override.provider),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
