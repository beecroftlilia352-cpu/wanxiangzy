import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGeneralImageReferences } from "@/lib/api/general-image-inputs.server";

const USER_ID = "018f47f1-b4c2-7a21-8f12-7a02169b89c1";
const MEDIA_ASSET_ID = "018f47f1-b4c2-7a21-8f12-7a02169b89c2";

type LibraryRow = {
  url?: string;
  media_asset_id?: string | null;
};

function createFakeSupabase(row: LibraryRow | null) {
  const chain = {
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
    select: () => chain,
  };
  return { from: () => chain };
}

describe("resolveGeneralImageReferences", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("passes canonical media assets and immutable site assets through", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    const result = await resolveGeneralImageReferences(
      [
        `/api/media-assets/${MEDIA_ASSET_ID}`,
        "https://app.example/api/media-assets/018f47f1-b4c2-7a21-8f12-7a02169b89c3",
        "https://assets.example.com/site-assets/original/guide.png",
      ],
      { userId: USER_ID, supabase: createFakeSupabase(null) as never, publicBaseUrl: "https://app.example" },
    );

    expect(result.disallowed).toEqual([]);
    expect(result.urls).toEqual([
      `/api/media-assets/${MEDIA_ASSET_ID}`,
      "https://app.example/api/media-assets/018f47f1-b4c2-7a21-8f12-7a02169b89c3",
      "https://assets.example.com/site-assets/original/guide.png",
    ]);
  });

  it("keeps legacy library OSS URLs and canonicalizes rows that have a media asset id", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    const legacyUrl = "https://assets.example.com/user-uploads/original/legacy.png";
    const generationUrl = "https://assets.example.com/generated-results/original/gen.png";
    const mediaUrl = "https://assets.example.com/user-uploads/original/new.png";

    let lookup: LibraryRow | null = { url: legacyUrl, media_asset_id: null };
    const supabase = {
      from: () => {
        const row = lookup;
        const chain = {
          eq: () => chain,
          in: () => chain,
          is: () => chain,
          limit: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
          select: () => chain,
        };
        return chain;
      },
    };

    const first = await resolveGeneralImageReferences([legacyUrl], {
      userId: USER_ID,
      supabase: supabase as never,
    });
    expect(first.urls).toEqual([legacyUrl]);
    expect(first.disallowed).toEqual([]);

    lookup = { url: generationUrl, media_asset_id: null };
    const second = await resolveGeneralImageReferences([generationUrl], {
      userId: USER_ID,
      supabase: supabase as never,
    });
    expect(second.urls).toEqual([generationUrl]);

    lookup = { url: mediaUrl, media_asset_id: MEDIA_ASSET_ID };
    const third = await resolveGeneralImageReferences([mediaUrl], {
      userId: USER_ID,
      supabase: supabase as never,
    });
    expect(third.urls).toEqual([`/api/media-assets/${MEDIA_ASSET_ID}`]);
  });

  it("rejects production URLs that are neither canonical nor owned", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    const result = await resolveGeneralImageReferences(
      ["https://attacker.example/private.png", "https://assets.example.com/unknown/other.png"],
      { userId: USER_ID, supabase: createFakeSupabase(null) as never },
    );

    expect(result.urls).toEqual([]);
    expect(result.disallowed).toEqual([
      "https://attacker.example/private.png",
      "https://assets.example.com/unknown/other.png",
    ]);
  });

  it("keeps the old permissive behavior outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const result = await resolveGeneralImageReferences(
      ["https://anything.example/source.png"],
      { userId: USER_ID, supabase: createFakeSupabase(null) as never },
    );

    expect(result).toEqual({ urls: ["https://anything.example/source.png"], disallowed: [] });
  });
});
