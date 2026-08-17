import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  checkRateLimit: vi.fn(),
  rateLimitResponse: vi.fn(),
  compose: vi.fn(),
  resolveOwnedMattingComposeRequest: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}));
vi.mock("@/lib/api/ai-tools/matting-compose.server", () => {
  class AiToolMattingComposeError extends Error {
    readonly code: string;
    readonly status: number;
    readonly retryable: boolean;

    constructor(message: string, options: { code: string; status?: number; retryable?: boolean }) {
      super(message);
      this.code = options.code;
      this.status = options.status ?? 400;
      this.retryable = options.retryable ?? false;
    }
  }
  return {
    AiToolMattingComposeError,
    composeAiToolMattingResult: mocks.compose,
  };
});
vi.mock("@/lib/api/ai-tools/input-ownership.server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/ai-tools/input-ownership.server")>();
  return { ...actual, resolveOwnedMattingComposeRequest: mocks.resolveOwnedMattingComposeRequest };
});

import { POST } from "@/app/api/ai-tools/matting/compose/route";
import { AiToolMattingComposeError } from "@/lib/api/ai-tools/matting-compose.server";
import { AiToolInputOwnershipError } from "@/lib/api/ai-tools/input-ownership.server";

describe("AI tool matting compose API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ supabase: {}, user: { id: "user-1" }, response: null });
    mocks.checkRateLimit.mockResolvedValue({ ok: true });
    mocks.resolveOwnedMattingComposeRequest.mockImplementation(async (request: unknown) => request);
  });

  it("requires authentication before rate limiting or image processing", async () => {
    mocks.requireApiUser.mockResolvedValue({
      user: null,
      response: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    });

    const response = await POST(jsonRequest({}));

    expect(response.status).toBe(401);
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.compose).not.toHaveBeenCalled();
  });

  it("returns structured result and reusable alpha outputs", async () => {
    mocks.compose.mockResolvedValue({
      result_urls: ["https://oss.example.com/generated/result.png"],
      outputs: [
        {
          url: "https://oss.example.com/generated/result.png",
          role: "result",
          kind: "image",
          mime_type: "image/png",
          dimensions: { width: 1200, height: 1600 },
        },
        {
          url: "https://oss.example.com/generated/alpha.png",
          role: "alpha",
          kind: "alpha",
          mime_type: "image/png",
          dimensions: { width: 1200, height: 1600 },
        },
      ],
      mask: {
        url: "https://ai-tool-ref.invalid/mask/signed-alpha-ref",
        ref: "signed-alpha-ref",
        width: 1200,
        height: 1600,
        content_type: "image/png",
        expires_at: "2026-08-17T13:30:00.000Z",
      },
    });

    const response = await POST(jsonRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/alpha.png",
      base_mask_kind: "alpha",
      edit_mask_url: "https://assets.example.com/edit.png",
      edit_operation: "subtract",
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      request_id: "request-1234",
      operation: "matting",
      result_urls: ["https://oss.example.com/generated/result.png"],
      outputs: [
        expect.objectContaining({ role: "result", kind: "image" }),
        expect.objectContaining({ role: "alpha", kind: "alpha" }),
      ],
      mask: {
        url: "https://ai-tool-ref.invalid/mask/signed-alpha-ref",
        ref: "signed-alpha-ref",
        width: 1200,
        height: 1600,
        content_type: "image/png",
        expires_at: "2026-08-17T13:30:00.000Z",
      },
    });
    expect(JSON.stringify(body)).not.toContain("object_key");
    expect(mocks.compose).toHaveBeenCalledWith({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/alpha.png",
      base_mask_kind: "alpha",
      edit_mask_url: "https://assets.example.com/edit.png",
      edit_operation: "subtract",
    }, { userId: "user-1" });
    expect(mocks.resolveOwnedMattingComposeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ source_url: "https://assets.example.com/source.png" }),
      {},
      expect.objectContaining({ userId: "user-1" }),
    );
  });

  it("does not compose when source or masks are not owned by the user", async () => {
    mocks.resolveOwnedMattingComposeRequest.mockRejectedValue(new AiToolInputOwnershipError(
      "基础蒙版不属于当前用户",
      { code: "AI_TOOL_ASSET_NOT_OWNED", status: 403 },
    ));

    const response = await POST(jsonRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://attacker.example.com/alpha.png",
      base_mask_kind: "alpha",
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "AI_TOOL_ASSET_NOT_OWNED",
      result_urls: [],
      outputs: [],
    });
    expect(mocks.compose).not.toHaveBeenCalled();
  });

  it("strictly rejects unknown JSON fields before composition", async () => {
    const response = await POST(jsonRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://assets.example.com/base.png",
      base_mask_kind: "mask",
      unexpected: true,
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "AI_TOOL_MATTING_VALIDATION_FAILED",
      details: { issues: [expect.objectContaining({ path: "$.unexpected", code: "unknown_field" })] },
      outputs: [],
    });
    expect(mocks.compose).not.toHaveBeenCalled();
  });

  it("requires JSON and rejects oversized requests", async () => {
    const wrongType = await POST(new Request("http://localhost/api/ai-tools/matting/compose", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    }));
    expect(wrongType.status).toBe(415);

    const oversized = await POST(new Request("http://localhost/api/ai-tools/matting/compose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(17 * 1024),
      },
      body: "{}",
    }));
    expect(oversized.status).toBe(413);
    expect(mocks.compose).not.toHaveBeenCalled();
  });

  it("preserves safe status and retryability from the composition service", async () => {
    mocks.compose.mockRejectedValue(new AiToolMattingComposeError("远程图片读取超时", {
      code: "AI_TOOL_MATTING_REMOTE_TIMEOUT",
      status: 504,
      retryable: true,
    }));

    const response = await POST(jsonRequest({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://assets.example.com/base.png",
      base_mask_kind: "mask",
    }));

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: "AI_TOOL_MATTING_REMOTE_TIMEOUT",
      retryable: true,
      result_urls: [],
      outputs: [],
    });
  });
});

function jsonRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ai-tools/matting/compose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
