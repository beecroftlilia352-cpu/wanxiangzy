import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/product-title 路由单测。
 * 鉴权 / 限流 / 入参校验走真实实现，只有「生成标题」与「限流判定」被替换成 mock，
 * 因此不会发起任何真实网络请求，也不读取任何真实密钥。
 */

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  checkRateLimit: vi.fn(),
  generateProductTitles: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));

vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: mocks.checkRateLimit,
}));

// 保留真实的 ProductTitleError 与其它导出，只替换真正调用上游的生成函数。
vi.mock("@/lib/product-title/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/product-title/server")>()),
  generateProductTitles: mocks.generateProductTitles,
}));

// 避免在路由测试里加载 sharp 原生绑定（生成函数已被 mock）。
vi.mock("sharp", () => ({ default: vi.fn() }));

import { POST } from "@/app/api/product-title/route";
import { ProductTitleError } from "@/lib/product-title/server";

const IMAGE_URL = "http://192.168.31.213:3000/api/media-assets/123e4567-e89b-42d3-a456-426614174000";

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/product-title", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/product-title", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: { id: "user-1" },
      response: null,
    });
    mocks.checkRateLimit.mockResolvedValue({ ok: true });
    mocks.generateProductTitles.mockResolvedValue({
      model: "deepseek-flash",
      titles: [{ en: "Ceramic Dripper", zh: "陶瓷滤杯", angle: "功能卖点" }],
      imageBytes: 140_000,
    });
  });

  it("未登录返回 401，且不调用上游生成", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await POST(postRequest({ imageUrl: IMAGE_URL }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "请先登录" });
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("触发限流返回 429 与中文提示，且不调用上游生成", async () => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });

    const response = await POST(postRequest({ imageUrl: IMAGE_URL }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    const payload = await response.json() as { error: string; retry_after_seconds: number };
    expect(payload.error).toContain("商品标题请求过于频繁");
    expect(payload.error).toContain("42");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("product-title:user-1", 12, 60_000);
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("入参非法返回 400（缺失 / 空串 / 类型不对 / 超长 / 协议相对地址）", async () => {
    const cases: unknown[] = [
      {},
      { imageUrl: "" },
      { imageUrl: "   " },
      { imageUrl: 123 },
      { imageUrl: null },
      { imageUrl: `/${"a".repeat(3000)}` },
      { imageUrl: "//evil.example.com/a.png" },
      { imageUrl: "file:///etc/passwd" },
    ];

    for (const body of cases) {
      const response = await POST(postRequest(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        code: "PRODUCT_TITLE_INVALID_INPUT",
      });
    }
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("成功时返回 { ok, model, titles }，并把去掉首尾空白的 imageUrl 交给生成函数", async () => {
    const response = await POST(postRequest({ imageUrl: `  ${IMAGE_URL}  ` }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      model: "deepseek-flash",
      titles: [{ en: "Ceramic Dripper", zh: "陶瓷滤杯", angle: "功能卖点" }],
    });
    expect(mocks.generateProductTitles).toHaveBeenCalledWith(IMAGE_URL);
  });

  it("也接受站内相对路径", async () => {
    const relative = "/api/media-assets/123e4567-e89b-42d3-a456-426614174000";
    const response = await POST(postRequest({ imageUrl: relative }));

    expect(response.status).toBe(200);
    expect(mocks.generateProductTitles).toHaveBeenCalledWith(relative);
  });

  it("业务错误按其状态码透传（413/502/503/504），并保留中文提示", async () => {
    const cases: Array<[ProductTitleError, number]> = [
      [new ProductTitleError("图片文件超过 4MB 上限，无法用于生成商品标题，请换一张结果图。", "PRODUCT_TITLE_IMAGE_TOO_LARGE", 413), 413],
      [new ProductTitleError("DeepSeek 服务返回错误（HTTP 500），请稍后重试。", "PRODUCT_TITLE_UPSTREAM_HTTP_500", 502), 502],
      [new ProductTitleError("生成商品标题超时，请重试。", "PRODUCT_TITLE_TIMEOUT", 504), 504],
      [new ProductTitleError("商品标题功能暂不可用：模型控制台里找不到已启用的 DeepSeek 供应商，请联系管理员。", "PRODUCT_TITLE_PROVIDER_UNAVAILABLE", 503), 503],
    ];

    for (const [error, status] of cases) {
      mocks.generateProductTitles.mockRejectedValueOnce(error);
      const response = await POST(postRequest({ imageUrl: IMAGE_URL }));
      expect(response.status).toBe(status);
      const payload = await response.json() as { ok: boolean; error: string; code: string };
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe(error.code);
      expect(payload.error).toBe(error.message);
    }
  });

  it("未知异常返回 500 与中文兜底提示，不抛出堆栈", async () => {
    mocks.generateProductTitles.mockRejectedValueOnce(new Error("boom: secret stack"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(postRequest({ imageUrl: IMAGE_URL }));

    expect(response.status).toBe(500);
    const payload = await response.json() as { ok: boolean; error: string; code: string };
    expect(payload).toMatchObject({ ok: false, error: "商品标题生成失败，请稍后重试。", code: "PRODUCT_TITLE_FAILED" });
    expect(payload.error).not.toContain("secret stack");
    spy.mockRestore();
  });
});
