import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import {
  registerVerifiedMediaAssetResource,
  registerTrustedUploadedResourceAsset,
  verifyUploadRegistrationToken,
} from "@/lib/resource-library/upload-registration";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json().catch(() => null);
    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const mediaAssetId = typeof input.media_asset_id === "string" ? input.media_asset_id.trim() : "";
    const asset = mediaAssetId
      ? await registerVerifiedMediaAssetResource(getAdminClient(), user.id, {
        mediaAssetId,
        title: typeof input.title === "string" ? input.title : null,
        originalFilename: typeof input.original_filename === "string" ? input.original_filename : null,
      })
      : await registerTrustedUploadedResourceAsset(
        getAdminClient(),
        user.id,
        verifyUploadRegistrationToken(input.token, user.id),
      );
    return NextResponse.json({ asset });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "本地资源登记失败");
  }
}
