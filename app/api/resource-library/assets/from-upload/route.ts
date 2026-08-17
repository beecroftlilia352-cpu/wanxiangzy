import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import {
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
    const token = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).token
      : null;
    const descriptor = verifyUploadRegistrationToken(token, user.id);
    const asset = await registerTrustedUploadedResourceAsset(getAdminClient(), user.id, descriptor);
    return NextResponse.json({ asset });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "本地资源登记失败");
  }
}
