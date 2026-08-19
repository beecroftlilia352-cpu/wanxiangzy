import type { SupabaseClient } from "@supabase/supabase-js";
import { isAllowedProductionImageInput } from "@/lib/api/general-image-inputs";

/**
 * Normalize a reference URL for resource-library ownership lookups.
 * The library stores canonical public OSS URLs without signing/variant
 * query parameters, so we compare both the exact value and the query-free
 * form to tolerate clients that carried over preview params.
 */
export function normalizeResourceLibraryLookupUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export type ResolvedGeneralImageReferences = {
  urls: string[];
  disallowed: string[];
};

/**
 * Resolve general-image reference URLs for the current user before any credit
 * debit. Production accepts canonical tenant media assets and immutable site
 * assets; anything else must belong to the caller's own resource library.
 * Legacy library rows (raw OSS upload/generation URLs without a media asset
 * id) stay usable because the row itself is server-written proof of
 * ownership, and the worker re-checks the same ownership before delivery.
 */
export async function resolveGeneralImageReferences(
  urls: string[],
  options: {
    userId: string;
    supabase: SupabaseClient;
    publicBaseUrl?: string | null;
  },
): Promise<ResolvedGeneralImageReferences> {
  if (process.env.NODE_ENV !== "production") {
    return { urls, disallowed: [] };
  }

  const resolved: string[] = [];
  const disallowed: string[] = [];
  for (const url of urls) {
    if (isAllowedProductionImageInput(url, options.publicBaseUrl)) {
      resolved.push(url);
      continue;
    }
    const owned = await resolveOwnedResourceLibraryUrl(url, options);
    if (owned) {
      resolved.push(owned);
    } else {
      disallowed.push(url);
    }
  }
  return { urls: resolved, disallowed };
}

async function resolveOwnedResourceLibraryUrl(
  url: string,
  options: {
    userId: string;
    supabase: SupabaseClient;
  },
): Promise<string | null> {
  const exact = url.trim();
  const normalized = normalizeResourceLibraryLookupUrl(url);
  const candidates = exact === normalized ? [exact] : [exact, normalized];

  let query = options.supabase
    .from("resource_library_assets")
    .select("url,media_asset_id")
    .eq("user_id", options.userId)
    .eq("media_type", "image")
    .in("storage_state", ["active", "migration_pending"])
    .eq("moderation_status", "allowed")
    .is("deleted_at", null)
    .in("url", candidates)
    .limit(1);

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;

  const row = data as { url?: unknown; media_asset_id?: unknown };
  const storedUrl = typeof row.url === "string" && row.url.trim() ? row.url.trim() : url;
  const mediaAssetId = typeof row.media_asset_id === "string" ? row.media_asset_id.trim() : "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaAssetId)) {
    return `/api/media-assets/${mediaAssetId}`;
  }
  return storedUrl;
}
