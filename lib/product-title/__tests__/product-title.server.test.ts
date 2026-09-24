import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiControlPlaneConfig } from "@/lib/ai-control-plane/types";

/**
 * 「商品标题」服务端模块单测（第二版：图片 + 文字描述 + 模型版本）。
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
  buildProductTitleUserPrompt,
  decodeProductTitleImageDataUrl,
  extractChatCompletionText,
  generateProductTitles,
  parseProductTitles,
  resolveDeepseekProvider,
  type ProductTitleGenerateInput,
} from "@/lib/product-title/server";
import { invalidateProductTitleModelsCache } from "@/lib/product-title/models";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_ERROR_CODES,
  PRODUCT_TITLE_MAX_TOKENS,
  PRODUCT_TITLE_PROVIDER_ID,
} from "@/lib/product-title/types";

const DECRYPTED_KEY = "sk-decrypted-server-key";
const NON_VISION_MODEL = "deepseek-v4-pro";
const TEXT_ONLY_HINT = "不支持图片输入，请填写文字描述或改用 deepseek-flash";

function dataUrl(label: string): string {
  return `data:image/jpeg;base64,${Buffer.from(label).toString("base64")}`;
}

const COMPRESSED_DATA_URL = `data:image/jpeg;base64,${Buffer.from("compressed-jpeg").toString("base64")}`;

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

type ChatBody = {
  model: string;
  stream: boolean;
  temperature: number;
  max_tokens: number;
  thinking: { type: string };
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;
};

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

function run(input: ProductTitleGenerateInput = {}, overrides: Record<string, unknown> = {}) {
  return generateProductTitles(input, {
    config: deepseekConfig(),
    loadImageBytes,
    fetchImpl: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
}

function lastBody(): ChatBody {
  const call = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return JSON.parse(String(call[1].body)) as ChatBody;
}

function userParts(body: ChatBody) {
  const content = body.messages[1].content;
  if (typeof content === "string") return { text: content, images: [] as string[] };
  return {
    text: content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n"),
    images: content.filter((part) => part.type === "image_url").map((part) => part.image_url?.url ?? ""),
  };
}

describe("product title server module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateProductTitleModelsCache();
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

  it("控制面里没有 deepseek 供应商时返回明确的中文错误（503）", async () => {
    const emptyConfig = { version: 1, models: [], deployments: [], providers: [] } as unknown as AiControlPlaneConfig;
    await expect(run({ description: "陶瓷滤杯" }, { config: emptyConfig })).rejects.toMatchObject({
      name: "ProductTitleError",
      code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    await expect(run({ description: "陶瓷滤杯" }, { config: emptyConfig })).rejects.toThrow(/找不到已启用的 DeepSeek 供应商/);
    await expect(run({ description: "陶瓷滤杯" }, { config: null })).rejects.toBeInstanceOf(ProductTitleError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("供应商被禁用或缺少密钥时不调用上游", async () => {
    await expect(run({ description: "陶瓷滤杯" }, { config: deepseekConfig({ enabled: false }) })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
      status: 503,
    });
    await expect(run({ description: "陶瓷滤杯" }, { config: deepseekConfig({ apiKey: "" }) })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_PROVIDER_KEY_MISSING",
      status: 503,
    });
    await expect(run({ description: "陶瓷滤杯" }, { config: deepseekConfig({ baseUrl: "" }) })).rejects.toMatchObject({
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

  it("vision 模型 + 5 张图：请求体含 5 个 image_url、thinking 关闭、max_tokens 2000、描述写进提示词", async () => {
    const images = ["a", "b", "c", "d", "e"].map((label) => dataUrl(label));
    const result = await run({ images, description: "陶瓷手冲滤杯，配不锈钢滤网", model: PRODUCT_TITLE_DEFAULT_MODEL });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${DECRYPTED_KEY}`);

    const body = lastBody();
    expect(body.model).toBe(PRODUCT_TITLE_DEFAULT_MODEL);
    expect(body.stream).toBe(false);
    expect(body.max_tokens).toBe(PRODUCT_TITLE_MAX_TOKENS);
    expect(body.thinking).toEqual({ type: "disabled" });

    const parts = userParts(body);
    expect(parts.images).toHaveLength(5);
    expect(parts.images.every((value) => value === COMPRESSED_DATA_URL)).toBe(true);
    // 多图必须明确要求「综合所有图片」，避免只描述其中一张
    expect(parts.text).toContain("5 张商品图片");
    expect(parts.text).toContain("不要只描述其中一张");
    expect(parts.text).toContain("陶瓷手冲滤杯，配不锈钢滤网");
    expect(parts.text).toContain('"titles"');

    // 每张图都过了服务端压缩（长边 ≤1024 / q80）
    expect(mocks.sharpFactory).toHaveBeenCalledTimes(5);
    expect(mocks.sharpFactory).toHaveBeenCalledWith(Buffer.from("a"));
    expect(mocks.sharpFactory).toHaveBeenCalledWith(Buffer.from("e"));

    expect(result.model).toBe(PRODUCT_TITLE_DEFAULT_MODEL);
    expect(result.vision).toBe(true);
    expect(result.imageCount).toBe(5);
    expect(result.titles).toHaveLength(3);
    expect(result.titles[0]).toEqual({
      en: "Ceramic Pour-Over Coffee Dripper for Home Brewing",
      zh: "家用陶瓷手冲咖啡滤杯",
      angle: "功能卖点",
    });

    // 请求体里不能出现任何密钥
    expect(String(init.body)).not.toContain(DECRYPTED_KEY);
    expect(JSON.stringify(result.titles)).not.toContain(DECRYPTED_KEY);
  });

  it("站内地址（http/相对路径）图片走 loadImageBytes，仍然内联成 data URL", async () => {
    await run({ images: ["/api/media-assets/123e4567-e89b-42d3-a456-426614174000"] });

    expect(loadImageBytes).toHaveBeenCalledWith("/api/media-assets/123e4567-e89b-42d3-a456-426614174000");
    expect(userParts(lastBody()).images).toEqual([COMPRESSED_DATA_URL]);
  });

  it("非 vision 模型（deepseek-v4-pro）+ 图 + 描述：请求体不含任何 image_url，只用文字", async () => {
    const result = await run({
      images: [dataUrl("a"), dataUrl("b")],
      description: "不锈钢折叠晾衣架",
      model: NON_VISION_MODEL,
    });

    const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(raw).not.toContain("image_url");
    expect(raw).not.toContain("data:image");

    const body = lastBody();
    expect(body.model).toBe(NON_VISION_MODEL);
    const parts = userParts(body);
    expect(parts.images).toHaveLength(0);
    expect(parts.text).toContain("不锈钢折叠晾衣架");
    expect(parts.text).toContain("请只根据下面的文字描述");
    // 没有发送图片就不该做图片压缩
    expect(mocks.sharpFactory).not.toHaveBeenCalled();
    expect(result.vision).toBe(false);
    expect(result.imageCount).toBe(0);
  });

  it("非 vision 模型 + 只给图不给描述 → 400 中文提示且不调用上游", async () => {
    await expect(run({ images: [dataUrl("a")], model: NON_VISION_MODEL })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.modelRequiresText,
      status: 400,
    });
    await expect(run({ images: [dataUrl("a")], model: NON_VISION_MODEL })).rejects.toThrow(new RegExp(TEXT_ONLY_HINT));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.sharpFactory).not.toHaveBeenCalled();
  });

  it("纯文字描述（vision 模型）+ 无图也能生成，且请求体不含 image_url", async () => {
    const result = await run({ description: "可折叠不锈钢晾衣架", model: PRODUCT_TITLE_DEFAULT_MODEL });

    const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(raw).not.toContain("image_url");
    const parts = userParts(lastBody());
    expect(parts.images).toHaveLength(0);
    expect(parts.text).toContain("请只根据下面的文字描述");
    expect(result.imageCount).toBe(0);
    expect(result.titles).toHaveLength(3);
  });

  it("既没有图片也没有描述 → 400，不调用上游", async () => {
    await expect(run({})).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.inputRequired,
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it(`超过 ${5} 张图片时服务端也拦（上限 = 5），不调用上游`, async () => {
    const images = Array.from({ length: 6 }, (_, index) => dataUrl(`img-${index}`));
    await expect(run({ images, description: "x" })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.tooManyImages,
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("模型不在能力表里 → 400", async () => {
    await expect(run({ description: "x", model: "deepseek-chat" })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.modelNotSupported,
      status: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非法 data URL → 400 且不调用上游", async () => {
    await expect(run({ images: ["data:text/plain;base64,AAAA"] })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.imageInvalid,
      status: 400,
    });
    await expect(run({ images: ["data:image/jpeg;base64,"] })).rejects.toBeInstanceOf(ProductTitleError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decodeProductTitleImageDataUrl 只接受图片 data URL", () => {
    expect(decodeProductTitleImageDataUrl(dataUrl("hi")).bytes.toString()).toBe("hi");
    expect(() => decodeProductTitleImageDataUrl("data:text/html;base64,AAAA")).toThrow(ProductTitleError);
    expect(() => decodeProductTitleImageDataUrl("not-a-data-url")).toThrow(ProductTitleError);
  });

  it("图片超过 4MB（站内大图）时返回明确错误且不调用上游", async () => {
    loadImageBytes.mockResolvedValue({ bytes: Buffer.alloc(5 * 1024 * 1024), contentType: "image/png", sourceId: "oversize" });
    await expect(run({ images: ["/api/media-assets/abc"] })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.imageTooLarge,
      status: 413,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("图片内容为空时返回明确错误", async () => {
    loadImageBytes.mockResolvedValue({ bytes: Buffer.alloc(0), contentType: "image/png", sourceId: "empty" });
    await expect(run({ images: ["/api/media-assets/abc"] })).rejects.toMatchObject({
      code: PRODUCT_TITLE_ERROR_CODES.imageEmpty,
      status: 400,
    });
  });

  it("PRODUCT_TITLE_MODEL 环境变量可以改变默认模型", async () => {
    process.env.PRODUCT_TITLE_MODEL = NON_VISION_MODEL;
    await run({ description: "陶瓷滤杯" });
    expect(lastBody().model).toBe(NON_VISION_MODEL);
  });

  it("模型用 ```json 包裹时能正确剥壳解析", async () => {
    fetchMock.mockImplementation(async () => chatResponse("```json\n" + VALID_CONTENT + "\n```"));
    const result = await run({ description: "陶瓷滤杯" });
    expect(result.titles).toHaveLength(3);
    expect(result.titles[2].angle).toBe("材质规格");
  });

  it("模型返回非 JSON 时给可读中文错误，而不是 500 堆栈", async () => {
    fetchMock.mockImplementation(async () => chatResponse("抱歉，我无法根据这些条件生成标题。"));
    await expect(run({ description: "陶瓷滤杯" })).rejects.toMatchObject({
      name: "ProductTitleError",
      code: "PRODUCT_TITLE_INVALID_JSON",
      status: 502,
    });
    await expect(run({ description: "陶瓷滤杯" })).rejects.toThrow(/不是可解析的标题 JSON/);
  });

  it("content 为空（推理占满输出）时报可读错误并可重试", async () => {
    fetchMock.mockImplementation(async () => chatResponse("", { reasoning_content: "这里是思考过程，不应展示给用户" }));
    await expect(run({ description: "陶瓷滤杯" })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_EMPTY_CONTENT",
      status: 502,
    });
    await expect(run({ description: "陶瓷滤杯" })).rejects.toThrow(/没有返回标题内容/);
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

  it("提示词：多图合并语义、文字描述补充、无图时不得编造", () => {
    const multi = buildProductTitleUserPrompt({ description: "套装含刷头与延长杆", imageCount: 3 });
    expect(multi).toContain("3 张商品图片");
    expect(multi).toContain("组成套装");
    expect(multi).toContain("不要只描述其中一张");
    expect(multi).toContain("套装含刷头与延长杆");

    const textOnly = buildProductTitleUserPrompt({ description: "棉质浴巾", imageCount: 0 });
    expect(textOnly).toContain("请只根据下面的文字描述");
    expect(textOnly).toContain("不要编造描述里没有的细节");
    expect(textOnly).toContain('{"titles"');
  });

  it("上游非 2xx 时只暴露状态码，不回传上游响应全文", async () => {
    fetchMock.mockImplementation(async () => new Response("upstream-secret-detail-不能外泄", { status: 500 }));
    const error = await run({ description: "陶瓷滤杯" }).catch((thrown: unknown) => thrown);
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
    await expect(run({ description: "陶瓷滤杯" })).rejects.toMatchObject({ code: "PRODUCT_TITLE_TIMEOUT", status: 504 });

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(run({ description: "陶瓷滤杯" })).rejects.toMatchObject({ code: "PRODUCT_TITLE_UPSTREAM_UNAVAILABLE", status: 502 });
  });

  it("上游 200 但响应体不是 JSON 时给可读错误", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(run({ description: "陶瓷滤杯" })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_UPSTREAM_INVALID_RESPONSE",
      status: 502,
    });
  });
});
