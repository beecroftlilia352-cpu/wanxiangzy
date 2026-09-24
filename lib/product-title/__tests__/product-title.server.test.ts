import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiControlPlaneConfig } from "@/lib/ai-control-plane/types";

/**
 * 「商品标题」服务端模块单测。
 * 全部使用 vi.mock / fetch mock：不发起任何真实网络请求，不读取真实密钥。
 */

const mocks = vi.hoisted(() => {
  const toBuffer = vi.fn(async () => Buffer.from("compressed-jpeg"));
  const pipeline: Record<string, unknown> = {};
  pipeline.rotate = vi.fn(() => pipeline);
  pipeline.resize = vi.fn(() => pipeline);
  pipeline.jpeg = vi.fn(() => pipeline);
  pipeline.toBuffer = toBuffer;
  const sharpFactory = vi.fn(() => pipeline);
  return { getAiControlPlaneConfig: vi.fn(), sharpFactory, toBuffer };
});

vi.mock("@/lib/ai-control-plane/server", () => ({
  getAiControlPlaneConfig: mocks.getAiControlPlaneConfig,
}));

vi.mock("sharp", () => ({ default: mocks.sharpFactory }));

import {
  ProductTitleError,
  extractChatCompletionText,
  generateProductTitles,
  parseProductTitles,
  resolveDeepseekProvider,
} from "@/lib/product-title/server";
import { PRODUCT_TITLE_PROVIDER_ID } from "@/lib/product-title/types";

const DECRYPTED_KEY = "sk-decrypted-test-key";
const IMAGE_URL = "http://192.168.31.213:3000/api/media-assets/123e4567-e89b-42d3-a456-426614174000";

function deepseekConfig(overrides: Partial<Record<string, unknown>> = {}): AiControlPlaneConfig {
  return {
    version: 1,
    models: [],
    deployments: [],
    providers: [
      {
        id: PRODUCT_TITLE_PROVIDER_ID,
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        apiKey: DECRYPTED_KEY,
        enabled: true,
        timeoutMs: 60_000,
        ...overrides,
      },
    ],
  } as unknown as AiControlPlaneConfig;
}

const VALID_CONTENT = JSON.stringify({
  titles: [
    { en: "Ceramic Pour-Over Coffee Dripper for Home Brewing", zh: "家用陶瓷手冲咖啡滤杯", angle: "功能卖点" },
    { en: "Minimalist Kitchen Gift for Coffee Lovers", zh: "送给咖啡爱好者的极简厨房礼物", angle: "场景人群" },
    { en: "Matte Glazed Stoneware Dripper 1-2 Cups", zh: "哑光釉面陶瓷滤杯 1-2 人份", angle: "材质规格" },
  ],
});

const fetchMock = vi.fn();

function chatResponse(content: string, extra: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content, ...extra } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

const loadImageBytes = vi.fn(async () => ({
  bytes: Buffer.from("raw-image-bytes"),
  contentType: "image/png",
  sourceId: "123e4567-e89b-42d3-a456-426614174000",
}));

function run(overrides: Record<string, unknown> = {}) {
  return generateProductTitles(IMAGE_URL, {
    config: deepseekConfig(),
    loadImageBytes,
    fetchImpl: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
}

describe("product title server module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAiControlPlaneConfig.mockResolvedValue(deepseekConfig());
    mocks.toBuffer.mockResolvedValue(Buffer.from("compressed-jpeg"));
    fetchMock.mockImplementation(async () => chatResponse(VALID_CONTENT));
    loadImageBytes.mockResolvedValue({
      bytes: Buffer.from("raw-image-bytes"),
      contentType: "image/png",
      sourceId: "123e4567-e89b-42d3-a456-426614174000",
    });
    delete process.env.PRODUCT_TITLE_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("控制面里没有 deepseek 供应商时返回明确的中文错误（503）", async () => {
    const emptyConfig = { version: 1, models: [], deployments: [], providers: [] } as unknown as AiControlPlaneConfig;
    await expect(run({ config: emptyConfig })).rejects.toMatchObject({
      name: "ProductTitleError",
      code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    await expect(run({ config: emptyConfig })).rejects.toThrow(/找不到已启用的 DeepSeek 供应商/);
    await expect(run({ config: null })).rejects.toBeInstanceOf(ProductTitleError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("供应商被禁用或缺少密钥时不调用上游", async () => {
    await expect(run({ config: deepseekConfig({ enabled: false }) })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    await expect(run({ config: deepseekConfig({ apiKey: "   " }) })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_PROVIDER_KEY_MISSING",
      status: 503,
    });
    await expect(run({ config: deepseekConfig({ baseUrl: "" }) })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_PROVIDER_BASE_URL_MISSING",
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolveDeepseekProvider 默认走控制面且要求解密后的密钥", async () => {
    const provider = await resolveDeepseekProvider({});
    expect(mocks.getAiControlPlaneConfig).toHaveBeenCalledWith({ decryptSecrets: true, allowLegacy: true });
    expect(provider.id).toBe(PRODUCT_TITLE_PROVIDER_ID);
    expect(provider.apiKey).toBe(DECRYPTED_KEY);
  });

  it("成功路径：model=deepseek-flash、base64 图片 data URL、Bearer 解密密钥、thinking 关闭且 max_tokens 充足", async () => {
    const result = await run();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.method).toBe("POST");

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${DECRYPTED_KEY}`);

    const body = JSON.parse(String(init.body)) as {
      model: string;
      stream: boolean;
      temperature: number;
      max_tokens: number;
      thinking: { type: string };
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(body.model).toBe("deepseek-flash");
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBeGreaterThanOrEqual(2000);
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.messages[0].role).toBe("system");
    expect(String(body.messages[0].content)).toContain("跨境电商");

    const userContent = body.messages[1].content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    expect(userContent[0].type).toBe("text");
    expect(userContent[1].type).toBe("image_url");
    expect(userContent[1].image_url?.url).toMatch(/^data:image\/jpeg;base64,/);
    // 压缩后送到模型的是 jpeg 字节（sharp 被 mock 成返回 compressed-jpeg）
    expect(userContent[1].image_url?.url).toBe(`data:image/jpeg;base64,${Buffer.from("compressed-jpeg").toString("base64")}`);

    // 请求体里不能出现任何密钥
    expect(String(init.body)).not.toContain(DECRYPTED_KEY);
    expect(JSON.stringify(result.titles)).not.toContain(DECRYPTED_KEY);

    expect(mocks.sharpFactory).toHaveBeenCalledWith(Buffer.from("raw-image-bytes"));
    expect(result.model).toBe("deepseek-flash");
    expect(result.titles).toHaveLength(3);
    expect(result.titles[0]).toEqual({
      en: "Ceramic Pour-Over Coffee Dripper for Home Brewing",
      zh: "家用陶瓷手冲咖啡滤杯",
      angle: "功能卖点",
    });
  });

  it("PRODUCT_TITLE_MODEL 可以覆盖默认模型", async () => {
    process.env.PRODUCT_TITLE_MODEL = "deepseek-chat";
    await run();
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as { model: string };
    expect(body.model).toBe("deepseek-chat");
  });

  it("模型用 ```json 包裹时能正确剥壳解析", async () => {
    fetchMock.mockImplementation(async () => chatResponse("```json\n" + VALID_CONTENT + "\n```"));
    const result = await run();
    expect(result.titles).toHaveLength(3);
    expect(result.titles[2].angle).toBe("材质规格");
  });

  it("模型返回非 JSON 时给可读中文错误，而不是 500 堆栈", async () => {
    fetchMock.mockImplementation(async () => chatResponse("抱歉，我无法根据这张图片生成标题。"));
    await expect(run()).rejects.toMatchObject({
      name: "ProductTitleError",
      code: "PRODUCT_TITLE_INVALID_JSON",
      status: 502,
    });
    await expect(run()).rejects.toThrow(/不是可解析的标题 JSON/);
  });

  it("content 为空（推理占满输出）时报可读错误并可重试", async () => {
    fetchMock.mockImplementation(async () => chatResponse("", { reasoning_content: "这里是思考过程，不应展示给用户" }));
    await expect(run()).rejects.toMatchObject({
      code: "PRODUCT_TITLE_EMPTY_CONTENT",
      status: 502,
    });
  });

  it("忽略 reasoning_content，只取 content 正文", () => {
    expect(extractChatCompletionText({
      choices: [{ message: { content: VALID_CONTENT, reasoning_content: "思考过程" } }],
    })).toBe(VALID_CONTENT);
    expect(extractChatCompletionText({ choices: [] })).toBe("");
    expect(extractChatCompletionText(null)).toBe("");
  });

  it("解析容错：缺失 zh/angle 时用英文兜底，多余条目截断到 3 条", () => {
    const titles = parseProductTitles(JSON.stringify({
      titles: [
        { en: "A" },
        { en: "B", zh: "乙" },
        { en: "C", zh: "丙", angle: "角度" },
        { en: "D", zh: "丁" },
      ],
    }));
    expect(titles).toHaveLength(3);
    expect(titles[0]).toEqual({ en: "A", zh: "A", angle: "" });
  });

  it("原始图片超过 4MB 时返回明确错误且不调用上游", async () => {
    loadImageBytes.mockResolvedValue({ bytes: Buffer.alloc(5 * 1024 * 1024), contentType: "image/png", sourceId: "oversize" });
    await expect(run()).rejects.toMatchObject({
      code: "PRODUCT_TITLE_IMAGE_TOO_LARGE",
      status: 413,
    });
    await expect(run()).rejects.toThrow(/超过 4MB 上限/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("图片内容为空时返回明确错误", async () => {
    loadImageBytes.mockResolvedValue({ bytes: Buffer.alloc(0), contentType: "image/png", sourceId: "empty" });
    await expect(run()).rejects.toMatchObject({ code: "PRODUCT_TITLE_IMAGE_EMPTY", status: 400 });
  });

  it("上游非 2xx 时只暴露状态码，不回传上游响应全文", async () => {
    fetchMock.mockImplementation(async () => new Response("upstream-secret-detail-不能外泄", { status: 500 }));
    const error = await run().catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(ProductTitleError);
    expect((error as ProductTitleError).status).toBe(502);
    expect((error as ProductTitleError).code).toBe("PRODUCT_TITLE_UPSTREAM_HTTP_500");
    expect((error as ProductTitleError).message).toContain("HTTP 500");
    expect((error as ProductTitleError).message).not.toContain("不能外泄");
  });

  it("上游超时映射为 504，网络失败映射为 502", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockRejectedValueOnce(timeout);
    await expect(run()).rejects.toMatchObject({ code: "PRODUCT_TITLE_TIMEOUT", status: 504 });

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(run()).rejects.toMatchObject({ code: "PRODUCT_TITLE_UPSTREAM_UNAVAILABLE", status: 502 });
  });

  it("上游 200 但响应体不是 JSON 时给可读错误", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(run()).rejects.toMatchObject({
      code: "PRODUCT_TITLE_UPSTREAM_INVALID_RESPONSE",
      status: 502,
    });
  });
});
