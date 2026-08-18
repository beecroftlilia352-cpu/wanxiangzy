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
import { getConfiguredVideoCreditRate } from "@/lib/ai-control-plane/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const enabledProviders = await getEnabledVideoProviders();
  const providers = await Promise.all(enabledProviders.map(async (provider: VideoProviderName) => {
    const modes = getVideoModes(provider);
    const rateEntries = await Promise.all(modes.flatMap((mode) => getVideoResolutions(provider, mode.value).map(async (resolution) => {
      const price = await getConfiguredVideoCreditRate(provider, mode.value, resolution.value);
      return [`${mode.value}:${resolution.value}`, price] as const;
    })));
    const pricingByMode = Object.fromEntries(rateEntries);
    const resolutionsByMode = Object.fromEntries(modes.map((mode) => [
      mode.value,
      getVideoResolutions(provider, mode.value).map((resolution) => {
        const price = pricingByMode[`${mode.value}:${resolution.value}`];
        return {
          ...resolution,
          minimum: price.minimum,
          pricePerSecond: price.perSecond,
          description: `${resolution.label} · ${price.perSecond} 灵点/秒`,
        };
      }),
    ]));
    return {
      provider,
      modes,
      resolutionsByMode,
      pricingByMode,
      durations: getVideoDurationOptions(provider),
      supportsMotionControl: supportsVideoMotionControl(provider),
      supportsFirstLastFrame: supportsVideoFirstLastFrame(provider),
    };
  }));

  return NextResponse.json(
    { enabled: providers.length > 0, providers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
