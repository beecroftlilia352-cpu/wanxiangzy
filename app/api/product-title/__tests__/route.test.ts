import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/product-title 路由单测（第二版入参：images / description / model）。
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
import {
  PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH,
  PRODUCT_TITLE_ERROR_CODES,
  PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH,
  PRODUCT_TITLE_MAX_IMAGES,
} from "@/lib/product-title/types";

const DATA_URL = `data:image/jpeg;base64,${Buffer.from("fake-image-bytes").toString("base64")}`;
const IMAGE_URL = "http://192.168.31.213:3000/api/media-assets/123e4567-e89b-42d3-a456-426614174000";
const RELATIVE_URL = "/api/media-assets/123e4567-e89b-42d3-a456-426614174000";

const TITLE = "Foldable Laundry Drying Rack for Small Balcony, Space Saving Clothes Hanger";
const TITLE_2 = "Wall Mounted Clothes Drying Rack for Balcony Apartment, Collapsible Organizer";
const TITLE_3 = "Space Saving Laundry Drying Rack for Indoor Outdoor Use, Portable Airer";

/** 生成函数返回的 3 条干净候选（路由只做逐条透传：title + 中文对照 zh + charCount + lint）。 */
function cleanTitles() {
  return [TITLE, TITLE_2, TITLE_3].map((title, index) => ({
    title,
    zh: `第 ${index + 1} 条中文对照`,
    charCount: title.length,
    overLimit: false,
    lint: { hasForbidden: false, hits: [] },
  }));
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/product-title", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function rawRequest(raw: string) {
  return new NextRequest("http://localhost/api/product-title", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw,
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
      vision: true,
      titles: cleanTitles(),
      imageCount: 1,
      imageBytes: 140_000,
    });
  });

  it("未登录返回 401，且不调用上游生成", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await POST(postRequest({ images: [DATA_URL] }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "请先登录" });
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("触发限流返回 429 与中文提示，且不调用上游生成", async () => {
    mocks.checkRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 42 });

    const response = await POST(postRequest({ description: "不锈钢晾衣架" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    const payload = await response.json() as { error: string };
    expect(payload.error).toContain("商品标题请求过于频繁");
    expect(payload.error).toContain("42");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("product-title:user-1", 12, 60_000);
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("无图且无描述返回 400（中文提示），不调用上游生成", async () => {
    for (const body of [{}, { images: [] }, { description: "   " }, { images: [], description: "" }]) {
      const response = await POST(postRequest(body));
      expect(response.status).toBe(400);
      const payload = await response.json() as { ok: boolean; code: string; error: string };
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.inputRequired);
      expect(payload.error).toContain("至少上传 1 张图片或填写商品描述");
    }
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it(`图片 ${PRODUCT_TITLE_MAX_IMAGES + 1} 张返回 400`, async () => {
    const response = await POST(postRequest({ images: Array.from({ length: PRODUCT_TITLE_MAX_IMAGES + 1 }, () => DATA_URL) }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { code: string; error: string };
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.tooManyImages);
    expect(payload.error).toContain(`最多只能上传 ${PRODUCT_TITLE_MAX_IMAGES} 张图片`);
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("刚好 5 张图片可以通过校验", async () => {
    const images = Array.from({ length: PRODUCT_TITLE_MAX_IMAGES }, () => DATA_URL);
    const response = await POST(postRequest({ images }));

    expect(response.status).toBe(200);
    expect(mocks.generateProductTitles).toHaveBeenCalledWith({
      images,
      description: "",
      model: "deepseek-flash",
    });
  });

  it("单个 data URL 超长返回 413", async () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(PRODUCT_TITLE_IMAGE_DATA_URL_MAX_LENGTH)}`;
    const response = await POST(postRequest({ images: [oversized] }));

    expect(response.status).toBe(413);
    const payload = await response.json() as { code: string; error: string };
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.imageTooLarge);
    expect(payload.error).toContain("2MB");
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("多张图片总长超过 8MB 返回 413", async () => {
    const each = `data:image/jpeg;base64,${"A".repeat(1_900_000)}`;
    const response = await POST(postRequest({ images: [each, each, each, each, each] }));

    expect(response.status).toBe(413);
    const payload = await response.json() as { code: string; error: string };
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.imageTooLarge);
    expect(payload.error).toContain("8MB");
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("description 上限是 6000：正好 6000 通过，6001 返回 400", async () => {
    expect(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH).toBe(6000);

    const ok = await POST(postRequest({ description: "描".repeat(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH) }));
    expect(ok.status).toBe(200);
    expect(mocks.generateProductTitles).toHaveBeenCalledTimes(1);

    const response = await POST(postRequest({
      description: "描".repeat(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH + 1),
    }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { code: string; error: string };
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.descriptionTooLong);
    expect(payload.error).toContain(String(PRODUCT_TITLE_DESCRIPTION_MAX_LENGTH));
    expect(mocks.generateProductTitles).toHaveBeenCalledTimes(1);
  });

  it("model 不在允许列表里返回 400", async () => {
    const response = await POST(postRequest({ description: "陶瓷滤杯", model: "gpt-5-secret" }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { code: string; error: string };
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.modelNotSupported);
    expect(payload.error).toContain("gpt-5-secret");
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("入参类型不对（images 不是数组 / 非字符串项 / 非法地址）返回 400", async () => {
    const cases: unknown[] = [
      { images: DATA_URL },
      { images: [123] },
      { images: ["   "] },
      { images: ["//evil.example.com/a.png"] },
      { images: ["file:///etc/passwd"] },
      { images: ["data:text/plain;base64,AAAA"] },
      { images: [DATA_URL], description: 42 },
      { images: [DATA_URL], model: 42 },
      ["not-an-object"],
    ];

    for (const body of cases) {
      const response = await POST(postRequest(body));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false });
    }
    expect(mocks.generateProductTitles).not.toHaveBeenCalled();
  });

  it("请求体不是合法 JSON 时返回 400", async () => {
    const response = await POST(rawRequest("{not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: PRODUCT_TITLE_ERROR_CODES.invalidInput });
  });

  it("成功时返回 { ok, model, titles: [{ title, zh, charCount, overLimit, lint }] }，并把入参（含默认模型）交给生成函数", async () => {
    const response = await POST(postRequest({ images: [DATA_URL], description: "  折叠晾衣架  " }));

    expect(response.status).toBe(200);
    const payload = await response.json() as Record<string, unknown>;
    expect(payload.ok).toBe(true);
    expect(payload.model).toBe("deepseek-flash");
    // 3 条逐条透传：title + 中文对照 zh + 服务端复算的 charCount + overLimit + lint
    expect(payload.titles).toEqual(cleanTitles());
    expect((payload.titles as Array<{ zh: string }>).map((item) => item.zh)).toEqual([
      "第 1 条中文对照",
      "第 2 条中文对照",
      "第 3 条中文对照",
    ]);
    // 没触发重试时 repaired 字段不出现；也不再返回顶层的 title/charCount/lint
    expect(payload).not.toHaveProperty("repaired");
    expect(payload).not.toHaveProperty("title");
    expect(payload).not.toHaveProperty("charCount");
    expect(payload).not.toHaveProperty("lint");
    expect(mocks.generateProductTitles).toHaveBeenCalledWith({
      images: [DATA_URL],
      description: "折叠晾衣架",
      model: "deepseek-flash",
    });
  });

  it("缺 zh（或 zh 不是字符串）时兜底空字符串，绝不因此报错", async () => {
    mocks.generateProductTitles.mockResolvedValueOnce({
      model: "deepseek-flash",
      vision: true,
      titles: [
        { title: TITLE, charCount: TITLE.length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_2, zh: 42, charCount: TITLE_2.length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_3, zh: "", charCount: TITLE_3.length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
      ],
      imageCount: 0,
      imageBytes: 0,
    });

    const response = await POST(postRequest({ description: "折叠晾衣架" }));

    expect(response.status).toBe(200);
    const payload = await response.json() as { titles: Array<{ title: string; zh: string }> };
    expect(payload.titles.map((item) => item.zh)).toEqual(["", "", ""]);
    expect(payload.titles.map((item) => item.title)).toEqual([TITLE, TITLE_2, TITLE_3]);
  });

  it("逐条的 zh / overLimit / lint / repaired 原样透传给前端（哪一条命中禁词一目了然）", async () => {
    mocks.generateProductTitles.mockResolvedValueOnce({
      model: "deepseek-flash",
      vision: true,
      titles: [
        { title: "Safe Microfiber Mop Head Washable", zh: "安全超细纤维拖把头", charCount: "Safe Microfiber Mop Head Washable".length, overLimit: false, lint: { hasForbidden: true, hits: ["Safe"] } },
        // 材质词与尺寸数字属于新规范要求的标题结构：命中为空、原样透传
        { title: "Stainless Steel Mop Head 45cm Washable", zh: "不锈钢拖把头 45cm", charCount: "Stainless Steel Mop Head 45cm Washable".length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_3, zh: "", charCount: TITLE_3.length, overLimit: true, lint: { hasForbidden: false, hits: [] } },
      ],
      repaired: false,
      imageCount: 0,
      imageBytes: 0,
    });

    const response = await POST(postRequest({ description: "超细纤维清洁头" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      model: "deepseek-flash",
      titles: [
        { title: "Safe Microfiber Mop Head Washable", zh: "安全超细纤维拖把头", charCount: "Safe Microfiber Mop Head Washable".length, overLimit: false, lint: { hasForbidden: true, hits: ["Safe"] } },
        { title: "Stainless Steel Mop Head 45cm Washable", zh: "不锈钢拖把头 45cm", charCount: "Stainless Steel Mop Head 45cm Washable".length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_3, zh: "", charCount: TITLE_3.length, overLimit: true, lint: { hasForbidden: false, hits: [] } },
      ],
      repaired: false,
    });
  });

  it("超长的那条 overLimit:true 照常返回（不改写、不重试，repaired 不出现）", async () => {
    const long = "Keyword ".repeat(40).trim();
    mocks.generateProductTitles.mockResolvedValueOnce({
      model: "deepseek-flash",
      vision: true,
      titles: [
        { title: `${long} A`, zh: "超长标题的中文对照", charCount: `${long} A`.length, overLimit: true, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_2, zh: "阳台壁挂折叠晾衣架", charCount: TITLE_2.length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
        { title: TITLE_3, charCount: TITLE_3.length, overLimit: false, lint: { hasForbidden: false, hits: [] } },
      ],
      imageCount: 0,
      imageBytes: 0,
    });

    const response = await POST(postRequest({ description: "折叠晾衣架" }));

    expect(response.status).toBe(200);
    const payload = await response.json() as { ok: boolean; titles: Array<{ zh: string; overLimit?: boolean; charCount: number }>; repaired?: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.titles[0].overLimit).toBe(true);
    expect(payload.titles[0].charCount).toBe(`${long} A`.length);
    // zh 照常透传；缺 zh 的那一条给空字符串（不参与任何判定）
    expect(payload.titles.map((item) => item.zh)).toEqual(["超长标题的中文对照", "阳台壁挂折叠晾衣架", ""]);
    expect(payload.titles[1].overLimit).toBe(false);
    // 没触发重试（只有禁词才触发）→ repaired 字段不出现
    expect(payload).not.toHaveProperty("repaired");
  });

  it("也接受站内相对路径 / http(s) 图片地址（保留上版资产读取路径）", async () => {
    const response = await POST(postRequest({ images: [RELATIVE_URL, IMAGE_URL], description: "" }));

    expect(response.status).toBe(200);
    expect(mocks.generateProductTitles).toHaveBeenCalledWith({
      images: [RELATIVE_URL, IMAGE_URL],
      description: "",
      model: "deepseek-flash",
    });
  });

  it("纯文字 + 指定 deepseek-flash 也可以生成", async () => {
    const response = await POST(postRequest({ description: "不锈钢折叠晾衣架，家用阳台", model: "deepseek-flash" }));

    expect(response.status).toBe(200);
    expect(mocks.generateProductTitles).toHaveBeenCalledWith({
      images: [],
      description: "不锈钢折叠晾衣架，家用阳台",
      model: "deepseek-flash",
    });
  });

  it("非 vision 模型（deepseek-v4-pro）+ 仅图片 → 400 且带可读中文提示", async () => {
    mocks.generateProductTitles.mockRejectedValueOnce(new ProductTitleError(
      "deepseek-v4-pro 不支持图片输入，请填写文字描述或改用 deepseek-flash。",
      PRODUCT_TITLE_ERROR_CODES.modelRequiresText,
      400,
    ));

    const response = await POST(postRequest({ images: [DATA_URL], model: "deepseek-v4-pro" }));

    expect(response.status).toBe(400);
    const payload = await response.json() as { ok: boolean; code: string; error: string };
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe(PRODUCT_TITLE_ERROR_CODES.modelRequiresText);
    expect(payload.error).toContain("deepseek-v4-pro 不支持图片输入");
    expect(payload.error).toContain("deepseek-flash");
    // 入参本身合法（v4-pro 在允许列表里），确实走到了生成函数
    expect(mocks.generateProductTitles).toHaveBeenCalledTimes(1);
  });

  it("业务错误按其状态码透传（413/502/503/504），并保留中文提示", async () => {
    const cases: Array<[ProductTitleError, number]> = [
      [new ProductTitleError("单张图片超过 2MB 上限，请压缩或换一张更小的图片。", PRODUCT_TITLE_ERROR_CODES.imageTooLarge, 413), 413],
      [new ProductTitleError("DeepSeek 服务返回错误（HTTP 500），请稍后重试。", "PRODUCT_TITLE_UPSTREAM_HTTP_500", 502), 502],
      [new ProductTitleError("生成商品标题超时，请重试。", "PRODUCT_TITLE_TIMEOUT", 504), 504],
      [new ProductTitleError("商品标题功能暂不可用：模型控制台里找不到已启用的 DeepSeek 供应商，请联系管理员。", "PRODUCT_TITLE_PROVIDER_UNAVAILABLE", 503), 503],
    ];

    for (const [error, status] of cases) {
      mocks.generateProductTitles.mockRejectedValueOnce(error);
      const response = await POST(postRequest({ description: "陶瓷滤杯" }));
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

    const response = await POST(postRequest({ description: "陶瓷滤杯" }));

    expect(response.status).toBe(500);
    const payload = await response.json() as { ok: boolean; error: string; code: string };
    expect(payload).toMatchObject({ ok: false, error: "商品标题生成失败，请稍后重试。", code: "PRODUCT_TITLE_FAILED" });
    expect(payload.error).not.toContain("secret stack");
    spy.mockRestore();
  });
});
