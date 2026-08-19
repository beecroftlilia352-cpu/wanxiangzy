import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  validateAndStoreAiToolMask: vi.fn(),
  createAiToolMaskReference: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}));
vi.mock("@/lib/api/ai-tools/mask-upload.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ai-tools/mask-upload.server")>();
  return { ...actual, validateAndStoreAiToolMask: mocks.validateAndStoreAiToolMask };
});
vi.mock("@/lib/api/ai-tools/asset-reference.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ai-tools/asset-reference.server")>();
  return { ...actual, createAiToolMaskReference: mocks.createAiToolMaskReference };
});

import { POST } from "@/app/api/ai-tools/masks/route";

describe("AI tool mask upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.checkRateLimit.mockResolvedValue({ ok: true });
    mocks.validateAndStoreAiToolMask.mockResolvedValue({
      url: "https://bucket.example/temp/mask.png",
      objectKey: "temp/mask.png",
      width: 16,
      height: 12,
      contentType: "image/png",
      selectedPixels: 24,
    });
    mocks.createAiToolMaskReference.mockReturnValue({
      token: "signed-mask-reference",
      referenceUrl: "https://ai-tool-ref.invalid/mask/signed-mask-reference",
      url: "https://bucket.example/temp/mask.png",
      objectKey: "temp/mask.png",
      width: 16,
      height: 12,
      contentType: "image/png",
      expiresAt: "2026-08-17T12:30:00.000Z",
    });
  });

  it("requires authentication before parsing the multipart body", async () => {
    mocks.requireApiUser.mockResolvedValue({
      user: null,
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
    });

    const response = await POST(new Request("http://localhost/api/ai-tools/masks", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(mocks.validateAndStoreAiToolMask).not.toHaveBeenCalled();
  });

  it("rejects non-multipart requests", async () => {
    const response = await POST(new Request("http://localhost/api/ai-tools/masks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ code: "AI_TOOL_MASK_MULTIPART_REQUIRED" });
  });

  it("accepts one PNG and returns only a short-lived opaque mask reference", async () => {
    const form = validForm();
    const response = await POST(requestWithForm(form));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      mask: {
        url: "https://ai-tool-ref.invalid/mask/signed-mask-reference",
        ref: "signed-mask-reference",
        width: 16,
        height: 12,
        content_type: "image/png",
        selected_pixels: 24,
        expires_at: "2026-08-17T12:30:00.000Z",
      },
    });
    expect(mocks.validateAndStoreAiToolMask).toHaveBeenCalledWith(expect.objectContaining({
      declaredContentType: "image/png",
      sourceWidth: 16,
      sourceHeight: 12,
      userId: "user-1",
    }));
    expect(mocks.createAiToolMaskReference).toHaveBeenCalledWith({
      userId: "user-1",
      url: "https://bucket.example/temp/mask.png",
      objectKey: "temp/mask.png",
      width: 16,
      height: 12,
      contentType: "image/png",
    });
  });

  it("rejects duplicate dimension fields and unknown fields", async () => {
    const duplicate = validForm();
    duplicate.append("source_width", "16");
    const duplicateResponse = await POST(requestWithForm(duplicate));
    expect(duplicateResponse.status).toBe(400);
    await expect(duplicateResponse.json()).resolves.toMatchObject({ code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_INVALID" });

    const unknown = validForm();
    unknown.append("storage_class", "upload");
    const unknownResponse = await POST(requestWithForm(unknown));
    expect(unknownResponse.status).toBe(400);
    await expect(unknownResponse.json()).resolves.toMatchObject({ code: "AI_TOOL_MASK_UNKNOWN_FIELD" });
  });
});

function validForm() {
  const form = new FormData();
  form.append("mask", new File([new Uint8Array([137, 80, 78, 71])], "mask.png", { type: "image/png" }));
  form.append("source_width", "16");
  form.append("source_height", "12");
  return form;
}

function requestWithForm(form: FormData) {
  const request = new Request("http://localhost/api/ai-tools/masks", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=unit-test" },
  });
  vi.spyOn(request, "formData").mockResolvedValue(form);
  return request;
}
