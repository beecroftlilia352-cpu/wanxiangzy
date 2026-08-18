import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { AiToolCreateRequest } from "@/lib/ai-tools/types";

const registrationMocks = vi.hoisted(() => ({
  verifyUploadRegistrationToken: vi.fn(),
}));
const remoteImageMocks = vi.hoisted(() => ({
  fetchRemoteImageBuffer: vi.fn(),
}));

vi.mock("@/lib/resource-library/upload-registration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resource-library/upload-registration")>();
  return { ...actual, verifyUploadRegistrationToken: registrationMocks.verifyUploadRegistrationToken };
});

vi.mock("@/lib/api/remote-image-fetch", () => ({
  fetchRemoteImageBuffer: remoteImageMocks.fetchRemoteImageBuffer,
}));

import { createAiToolMaskReference } from "@/lib/api/ai-tools/asset-reference.server";
import {
  extractAiToolInputProofs,
  extractAiToolMattingComposeProofs,
  resolveOwnedAiToolRequest,
  resolveOwnedMattingComposeRequest,
} from "@/lib/api/ai-tools/input-ownership.server";

const SOURCE_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com/user-uploads/original/source.png";
const MASK_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com/temp/original/mask.png";
const REFERENCE_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com/user-uploads/original/reference.png";
const REFERENCE_MASK_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com/temp/original/reference-mask.png";
const ENV_KEYS = [
  "AI_TOOL_ASSET_REF_SECRET",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
  "ALIYUN_OSS_GENERATED_PREFIX",
  "ALIYUN_OSS_TEMP_PREFIX",
] as const;

describe("AI tool input ownership", () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    vi.clearAllMocks();
    remoteImageMocks.fetchRemoteImageBuffer.mockReset();
    process.env.AI_TOOL_ASSET_REF_SECRET = "test-input-proof-secret";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_GENERATED_PREFIX = "generated-results/original";
    process.env.ALIYUN_OSS_TEMP_PREFIX = "temp/original";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) restoreEnv(key, originalEnv[key]);
  });

  it("accepts a raw URL only when it resolves to an active image owned by the current user", async () => {
    const { supabase, builder } = supabaseReturning({
      id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      url: SOURCE_URL,
      width: 16,
      height: 12,
    });

    await expect(resolveOwnedAiToolRequest(resizeRequest(), {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({ source_url: SOURCE_URL });
    expect(builder.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("url", SOURCE_URL);
    expect(builder.eq).toHaveBeenCalledWith("storage_state", "active");
    expect(builder.eq).toHaveBeenCalledWith("moderation_status", "allowed");
  });

  it("resolves canonical media-registry uploads by owner and verified status", async () => {
    const assetId = "12fd7fb7-c39e-4e82-98eb-6f35630a0f93";
    const request = { ...resizeRequest(), source_url: `/api/media-assets/${assetId}` };
    const { supabase, from, builder } = supabaseReturning({
      id: assetId,
      status: "verified",
      width: 16,
      height: 12,
    });

    await expect(resolveOwnedAiToolRequest(request, { sourceAssetId: assetId }, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({ source_url: request.source_url });
    expect(from).toHaveBeenCalledWith("media_asset_records");
    expect(builder.eq).toHaveBeenCalledWith("owner_user_id", "user-1");
    expect(builder.eq).toHaveBeenCalledWith("status", "verified");
  });

  it("fails closed when a client submits an arbitrary URL", async () => {
    const { supabase } = supabaseReturning(null);

    await expect(resolveOwnedAiToolRequest(resizeRequest(), {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_INPUT_NOT_OWNED", status: 403 });
  });

  it("accepts the existing user-bound upload registration token without a database lookup", async () => {
    registrationMocks.verifyUploadRegistrationToken.mockReturnValue({
      url: SOURCE_URL,
      objectKey: "user-uploads/original/source.png",
      mediaType: "image",
      width: 16,
      height: 12,
    });
    const { supabase, from } = supabaseReturning(null);

    await expect(resolveOwnedAiToolRequest(resizeRequest(), { sourceRef: "signed-upload-token" }, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({ source_url: SOURCE_URL });
    expect(registrationMocks.verifyUploadRegistrationToken).toHaveBeenCalledWith("signed-upload-token", "user-1");
    expect(from).not.toHaveBeenCalled();
  });

  it("resolves an opaque mask reference to its private provider URL only after dimensions match", async () => {
    const reference = createMaskReference(16, 12);
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: 16, height: 12 });
    const request = eraseRequest(reference.referenceUrl);

    await expect(resolveOwnedAiToolRequest(request, {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({
      source_url: SOURCE_URL,
      mask_url: MASK_URL,
    });
  });

  it("preflights an owned resource image when legacy metadata is missing but a mask needs trusted dimensions", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 12, channels: 3, background: "white" },
    }).png().toBuffer();
    remoteImageMocks.fetchRemoteImageBuffer.mockResolvedValue({
      bytes,
      contentType: "image/png",
      url: SOURCE_URL,
    });
    const reference = createMaskReference(16, 12);
    const { supabase } = supabaseReturning({
      id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      url: SOURCE_URL,
      width: null,
      height: null,
    });

    await expect(resolveOwnedAiToolRequest(eraseRequest(reference.referenceUrl), {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({ source_url: SOURCE_URL, mask_url: MASK_URL });
    expect(remoteImageMocks.fetchRemoteImageBuffer).toHaveBeenCalledWith(SOURCE_URL, expect.objectContaining({
      allowedContentTypes: ["image"],
      maxBytes: 32 * 1024 * 1024,
    }));
  });

  it("does not fetch legacy dimensions for tools that do not submit a mask", async () => {
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: null, height: null });

    await expect(resolveOwnedAiToolRequest(resizeRequest(), {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({ source_url: SOURCE_URL });
    expect(remoteImageMocks.fetchRemoteImageBuffer).not.toHaveBeenCalled();
  });

  it("fails closed when a legacy resource image cannot be safely decoded for mask validation", async () => {
    remoteImageMocks.fetchRemoteImageBuffer.mockResolvedValue({
      bytes: Buffer.from("not-an-image"),
      contentType: "image/png",
      url: SOURCE_URL,
    });
    const reference = createMaskReference(16, 12);
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: null, height: null });

    await expect(resolveOwnedAiToolRequest(eraseRequest(reference.referenceUrl), {}, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_SOURCE_CANONICAL_REQUIRED", status: 409 });
  });

  it("rejects raw masks, stolen references, and source dimension mismatches", async () => {
    const matchingAsset = { url: SOURCE_URL, width: 16, height: 12 };
    const reference = createMaskReference(15, 12);

    await expect(resolveOwnedAiToolRequest(eraseRequest(MASK_URL), {}, {
      userId: "user-1",
      supabase: supabaseReturning(matchingAsset).supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_REFERENCE_INVALID", status: 400 });

    await expect(resolveOwnedAiToolRequest(eraseRequest(createMaskReference(16, 12).referenceUrl), {}, {
      userId: "user-2",
      supabase: supabaseReturning(matchingAsset).supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_REFERENCE_FORBIDDEN", status: 403 });

    await expect(resolveOwnedAiToolRequest(eraseRequest(reference.referenceUrl), {}, {
      userId: "user-1",
      supabase: supabaseReturning(matchingAsset).supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_MISMATCH", status: 409 });
  });

  it("resolves a signed reference mask only when it matches the owned reference dimensions", async () => {
    registrationMocks.verifyUploadRegistrationToken.mockImplementation((token: string) => {
      if (token !== "reference-upload-token") throw new Error("unexpected token");
      return {
        url: REFERENCE_URL,
        objectKey: "user-uploads/original/reference.png",
        mediaType: "image",
        width: 24,
        height: 16,
      };
    });
    const referenceMask = createAiToolMaskReference({
      userId: "user-1",
      url: REFERENCE_MASK_URL,
      objectKey: "temp/original/reference-mask.png",
      width: 24,
      height: 16,
      contentType: "image/png",
    });
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: 16, height: 12 });

    await expect(resolveOwnedAiToolRequest(garmentRequest(REFERENCE_MASK_URL), {
      referenceRefs: ["reference-upload-token"],
      referenceMaskRef: referenceMask.token,
    }, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).resolves.toMatchObject({
      reference_urls: [REFERENCE_URL],
      reference_mask_url: REFERENCE_MASK_URL,
    });

    const wrongSize = createAiToolMaskReference({
      userId: "user-1",
      url: REFERENCE_MASK_URL,
      objectKey: "temp/original/reference-mask.png",
      width: 23,
      height: 16,
      contentType: "image/png",
    });
    await expect(resolveOwnedAiToolRequest(garmentRequest(wrongSize.referenceUrl), {
      referenceRefs: ["reference-upload-token"],
    }, {
      userId: "user-1",
      supabase,
      executionMode: "live",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_MISMATCH", status: 409 });
  });

  it("strips recognized proof fields while preserving unknown fields for the strict parser", () => {
    const result = extractAiToolInputProofs({
      ...resizeRequest(),
      source_ref: "signed-token",
      source_asset_id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      reference_mask_ref: "signed-reference-mask",
      unexpected: true,
    });

    expect(result.proofs).toMatchObject({
      sourceRef: "signed-token",
      sourceAssetId: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      referenceMaskRef: "signed-reference-mask",
    });
    expect(result.requestBody).toMatchObject({ source_url: SOURCE_URL, unexpected: true });
    expect(result.requestBody).not.toHaveProperty("source_ref");
    expect(result.requestBody).not.toHaveProperty("reference_mask_ref");
  });

  it("keeps development mock requests backward compatible without ownership queries", async () => {
    const { supabase, from } = supabaseReturning(null);
    const request = resizeRequest();

    await expect(resolveOwnedAiToolRequest(request, {}, {
      userId: "user-1",
      supabase,
      executionMode: "mock",
    })).resolves.toBe(request);
    expect(from).not.toHaveBeenCalled();
  });

  it("accepts compose masks only from signed refs or user-scoped AI OSS objects", async () => {
    const baseUrl = "https://bucket.oss-cn-hongkong.aliyuncs.com/temp/original/2026/base-c6c289e49e9c.png";
    const editReference = createMaskReference(16, 12);
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: 16, height: 12 });

    await expect(resolveOwnedMattingComposeRequest({
      request_id: "compose-owned-1234",
      source_url: SOURCE_URL,
      base_mask_url: baseUrl,
      base_mask_kind: "alpha",
      edit_mask_url: editReference.referenceUrl,
      edit_operation: "subtract",
    }, {}, { userId: "user-1", supabase })).resolves.toMatchObject({
      source_url: SOURCE_URL,
      base_mask_url: baseUrl,
      edit_mask_url: MASK_URL,
    });
  });

  it("rejects arbitrary compose base masks before the image composer can fetch them", async () => {
    const { supabase } = supabaseReturning({ url: SOURCE_URL, width: 16, height: 12 });

    await expect(resolveOwnedMattingComposeRequest({
      request_id: "compose-owned-1234",
      source_url: SOURCE_URL,
      base_mask_url: "https://attacker.example/base.png",
      base_mask_kind: "mask",
    }, {}, { userId: "user-1", supabase })).rejects.toMatchObject({
      code: "AI_TOOL_ASSET_NOT_OWNED",
      status: 403,
    });
  });

  it("extracts compose proof fields without weakening its strict payload parser", () => {
    const extracted = extractAiToolMattingComposeProofs({
      request_id: "compose-owned-1234",
      source_url: SOURCE_URL,
      source_asset_id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      base_mask_url: MASK_URL,
      base_mask_kind: "mask",
      edit_mask_ref: "signed-edit-ref",
      unexpected: true,
    });
    expect(extracted.proofs).toMatchObject({
      sourceAssetId: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
      editMaskRef: "signed-edit-ref",
    });
    expect(extracted.requestBody).toMatchObject({ unexpected: true, base_mask_url: MASK_URL });
    expect(extracted.requestBody).not.toHaveProperty("source_asset_id");
  });
});

function resizeRequest(): AiToolCreateRequest {
  return {
    request_id: "request-owned-1234",
    operation: "resize",
    source_url: SOURCE_URL,
    reference_urls: [],
    options: {
      width: 800,
      height: 800,
      fit: "contain",
      output_format: "png",
      quality: 90,
      without_enlargement: false,
    },
  };
}

function eraseRequest(maskUrl: string): AiToolCreateRequest {
  return {
    request_id: "request-owned-1234",
    operation: "erase",
    source_url: SOURCE_URL,
    mask_url: maskUrl,
    reference_urls: [],
    options: {
      mask_feather: 0,
      output_format: "png",
      quality: "standard",
    },
  };
}

function garmentRequest(referenceMaskUrl: string): AiToolCreateRequest {
  return {
    request_id: "request-owned-1234",
    operation: "repair-garment",
    source_url: SOURCE_URL,
    reference_urls: [REFERENCE_URL],
    reference_mask_url: referenceMaskUrl,
    options: {
      reference_type: "model",
      preserve_logo: true,
      repair_mode: "style",
      mask_feather: 8,
      output_format: "png",
    },
  };
}

function createMaskReference(width: number, height: number) {
  return createAiToolMaskReference({
    userId: "user-1",
    url: MASK_URL,
    objectKey: "temp/original/mask.png",
    width,
    height,
    contentType: "image/png",
  });
}

function supabaseReturning(data: Record<string, unknown> | null, error: unknown = null) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data, error }));
  const from = vi.fn(() => builder);
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    builder,
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
