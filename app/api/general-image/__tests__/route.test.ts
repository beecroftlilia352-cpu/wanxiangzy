import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createDebitedGeneration: vi.fn(),
  getConfiguredImageCreditCost: vi.fn(),
  resolveGeneralImageReferences: vi.fn(),
  startGenerationJob: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
  })),
}));

vi.mock("@/lib/ai-control-plane/server", () => ({
  getConfiguredImageCreditCost: mocks.getConfiguredImageCreditCost,
}));

vi.mock("@/lib/api/credits", () => ({
  createDebitedGeneration: mocks.createDebitedGeneration,
  errorToResponsePayload: (error: unknown) => ({
    status: 500,
    body: { error: error instanceof Error ? error.message : "unknown error" },
  }),
}));

vi.mock("@/lib/api/generation-jobs", () => ({
  startGenerationJob: mocks.startGenerationJob,
}));

vi.mock("@/lib/api/generation-status", () => ({
  handleGenerationStatusGet: vi.fn(),
}));

vi.mock("@/lib/api/image-inputs.server", () => ({
  getPublicBaseUrlFromRequest: () => "https://pixel-diffusion.com",
}));

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  rateLimitResponse: vi.fn(),
}));

vi.mock("@/lib/api/general-image-inputs.server", () => ({
  resolveGeneralImageReferences: mocks.resolveGeneralImageReferences,
}));

import { POST } from "../route";

describe("POST /api/general-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getConfiguredImageCreditCost.mockResolvedValue(3);
    mocks.resolveGeneralImageReferences.mockResolvedValue({
      urls: ["https://example.com/reference-1.png", "https://example.com/reference-2.png"],
      disallowed: [],
    });
    mocks.createDebitedGeneration.mockResolvedValue({
      generationId: "generation-1",
      creditsRemaining: 88,
    });
  });

  it("creates one aggregate generation for one-per-reference runs", async () => {
    const request = new NextRequest("http://localhost/api/general-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "aggregate-run-1",
      },
      body: JSON.stringify({
        mode: "image-to-image",
        prompt: "保留主体，统一生成棚拍效果",
        reference_urls: [
          "https://example.com/reference-1.png",
          "https://example.com/reference-2.png",
        ],
        ai_model: "nano-banana-2",
        image_size: "1K",
        aspect_ratio: "1:1",
        gen_count: 2,
        one_per_reference: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.createDebitedGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.createDebitedGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        creditsCost: 12,
        idempotencyKey: "aggregate-run-1",
        jobPayload: expect.objectContaining({
          kind: "generalImage",
          genCount: 2,
          onePerReference: true,
          referenceUrls: [
            "https://example.com/reference-1.png",
            "https://example.com/reference-2.png",
          ],
        }),
      }),
    );
    expect(mocks.startGenerationJob).toHaveBeenCalledTimes(1);
    expect(mocks.startGenerationJob).toHaveBeenCalledWith("generation-1");
    expect(body).toEqual({
      generation_id: "generation-1",
      credits_cost: 12,
      credits_remaining: 88,
      status: "processing_tryon",
    });
    expect(body).not.toHaveProperty("generation_ids");
    expect(body).not.toHaveProperty("batch_id");
  });

  it("rejects more than six inputs for one-per-reference mode", async () => {
    const references = Array.from({ length: 7 }, (_, index) => `https://example.com/reference-${index + 1}.png`);
    mocks.resolveGeneralImageReferences.mockResolvedValue({ urls: references, disallowed: [] });
    const request = new NextRequest("http://localhost/api/general-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "aggregate-run-over-limit",
      },
      body: JSON.stringify({
        mode: "image-to-image",
        prompt: "每张参考图分别应用当前提示词",
        reference_urls: references,
        ai_model: "nano-banana-2",
        image_size: "1K",
        aspect_ratio: "1:1",
        gen_count: 4,
        one_per_reference: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("最多支持 6 张输入图");
    expect(mocks.createDebitedGeneration).not.toHaveBeenCalled();
  });
});
