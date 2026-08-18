import { NextResponse } from "next/server";
import {
  getVideoDurationOptions,
  getVideoModes,
  getVideoResolutions,
  supportsVideoFirstLastFrame,
  supportsVideoMotionControl,
  type VideoProviderName,
} from "@/lib/api/video-catalog";
import { getEnabledVideoProviders } from "@/lib/api/video-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabledProviders = await getEnabledVideoProviders();
  const providers = enabledProviders.map((provider: VideoProviderName) => {
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
