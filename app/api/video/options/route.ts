import { NextResponse } from "next/server";
import {
  getVideoDurationOptions,
  getVideoModes,
  getVideoResolutions,
  supportsVideoFirstLastFrame,
  supportsVideoMotionControl,
  type VideoProviderName,
} from "@/lib/api/video-catalog";
import { getEnabledVideoProviderOverrides } from "@/lib/api/video-provider-registry.server";

export const dynamic = "force-dynamic";

export async function GET() {
  const overrides = await getEnabledVideoProviderOverrides();
  const providers = overrides.map((override) => {
    const provider = override.provider as VideoProviderName;
    return {
      provider,
      modes: getVideoModes(provider),
      resolutionsByMode: Object.fromEntries(
        getVideoModes(provider).map((mode) => [mode.value, getVideoResolutions(provider, mode.value)]),
      ),
      durations: getVideoDurationOptions(provider),
      supportsMotionControl: supportsVideoMotionControl(provider),
      supportsFirstLastFrame: supportsVideoFirstLastFrame(provider),
    };
  });

  return NextResponse.json(
    { enabled: providers.length > 0, providers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
