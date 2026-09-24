import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiControlPlaneConfig } from "@/lib/ai-control-plane/types";

/**
 * 「商品标题」服务端模块单测（第五版：新规范 → 3 条英文标题 + 逐条中文对照 + 逐条字符数）。
 * lint 只认**禁词**：材质词与尺寸/容量数字属于新规范要求的标题结构，原样保留、不重试；
 * 超长（>250）只标注 overLimit，同样不重试。
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
  decodeProductTitleImageDataUrl,
  extractChatCompletionText,
  generateProductTitles,
  parseProductTitles,
  resolveDeepseekProvider,
  type ProductTitleGenerateInput,
} from "@/lib/product-title/server";
import { invalidateProductTitleModelsCache } from "@/lib/product-title/models";
import {
  PRODUCT_TITLE_DEFAULT_DESCRIPTION,
  PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT,
  PRODUCT_TITLE_SPEC,
  PRODUCT_TITLE_SYSTEM_PROMPT,
  buildProductTitleMessages,
  buildProductTitleOperationalNotes,
  buildProductTitleRepairInstruction,
} from "@/lib/product-title/prompt";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_ERROR_CODES,
  PRODUCT_TITLE_MAX_CANDIDATES,
  PRODUCT_TITLE_MAX_CHARS,
  PRODUCT_TITLE_MAX_TOKENS,
  PRODUCT_TITLE_PROVIDER_ID,
} from "@/lib/product-title/types";

const DECRYPTED_KEY = "sk-dec...-key";
const NON_VISION_MODEL = "deepseek-v4-pro";
const TEXT_ONLY_HINT = "不支持图片输入，请填写文字描述或改用 deepseek-flash";

/** 一次请求的 3 条候选（都不含禁词，且都 ≤250 字符；长度都短于 200 也不影响返回）。 */
const GOOD_TITLES = [
  "Foldable Laundry Drying Rack for Small Balcony, Space Saving Clothes Hanger",
  "Wall Mounted Clothes Drying Rack for Balcony Apartment, Collapsible Organizer",
  "Space Saving Laundry Drying Rack for Indoor Outdoor Use, Portable Airer",
];
const GOOD_TITLE = GOOD_TITLES[0];
const CLEAN_TITLES = [
  "Washable Cleaning Head for Spin Mop, Space Saving Replacement Part",
  "Spin Mop Cleaning Head Replacement for Home Floor Cleaning",
  "Rotating Mop Refill Cleaning Head for Household Floor Care",
];
/** 超过 250 字符、且不含材质词/尺寸数字/禁词的标题（只测超长分支）。 */
const OVER_LONG_TITLE = Array.from({ length: 60 }, () => "Keyword").join(" ");

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

/**
 * 按契约造一条模型输出：titles[] 每条带 zh（中文对照）与故意写歪的 charCount
 * （服务端必须自己按英文 title 复算，且 zh 只作对照）。
 */
function titlesContent(titles: readonly string[], charCount = 140): string {
  return JSON.stringify({
    titles: titles.map((title, index) => ({ title, zh: `第 ${index + 1} 条中文对照`, charCount })),
  });
}

/** 与 titlesContent 的 zh 模板一致：解析结果里逐条的 title + zh（zh 不参与任何计算）。 */
function candidatesOf(titles: readonly string[]): Array<{ title: string; zh: string }> {
  return titles.map((title, index) => ({ title, zh: `第 ${index + 1} 条中文对照` }));
}

const VALID_CONTENT = titlesContent(GOOD_TITLES);
const CLEAN_CONTENT = titlesContent(CLEAN_TITLES);

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

/** 第 n 次请求的请求体（0 = 第一次）。 */
function bodyAt(index: number): ChatBody {
  const call = fetchMock.mock.calls[index] as [string, RequestInit];
  return JSON.parse(String(call[1].body)) as ChatBody;
}

function lastBody(): ChatBody {
  return bodyAt(fetchMock.mock.calls.length - 1);
}

function textOfPart(content: ChatBody["messages"][number]["content"]): string {
  if (typeof content === "string") return content;
  return content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
}

function imagesOfPart(content: ChatBody["messages"][number]["content"]): string[] {
  if (typeof content === "string") return [];
  return content.filter((part) => part.type === "image_url").map((part) => part.image_url?.url ?? "");
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

  it("vision 模型 + 5 张图：请求体含 5 个 image_url、messages 只由拼装函数生成、thinking 关闭、max_tokens 2000", async () => {
    const images = ["a", "b", "c", "d", "e"].map((label) => dataUrl(label));
    const description = "折叠晾衣架，家用阳台";
    const result = await run({ images, description, model: PRODUCT_TITLE_DEFAULT_MODEL });

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

    // messages 只由 buildProductTitleMessages 拼装（默认放置：规范在 user 文本里）
    expect(body.messages).toEqual(buildProductTitleMessages({
      description,
      imageDataUrls: Array(5).fill(COMPRESSED_DATA_URL),
    }));
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT);
    expect(String(body.messages[0].content)).toContain('"titles"');
    expect(String(body.messages[0].content)).toContain('"title"');
    expect(String(body.messages[0].content)).toContain('"zh"');
    expect(String(body.messages[0].content)).toContain("charCount");
    expect(String(body.messages[0].content)).toContain("恰好返回 3 条");
    expect(String(body.messages[0].content)).not.toContain(PRODUCT_TITLE_SPEC);

    // user 消息带描述与图片
    expect(body.messages[1].role).toBe("user");
    const userText = textOfPart(body.messages[1].content);
    expect(userText).toContain("我提供了 5 张商品图片");
    expect(userText).toContain(description);
    expect(imagesOfPart(body.messages[1].content)).toEqual(Array(5).fill(COMPRESSED_DATA_URL));

    // 每张图都过了服务端压缩（长边 ≤1024 / q80）
    expect(mocks.sharpFactory).toHaveBeenCalledTimes(5);
    expect(mocks.sharpFactory).toHaveBeenCalledWith(Buffer.from("a"));
    expect(mocks.sharpFactory).toHaveBeenCalledWith(Buffer.from("e"));

    expect(result.model).toBe(PRODUCT_TITLE_DEFAULT_MODEL);
    expect(result.vision).toBe(true);
    expect(result.imageCount).toBe(5);
    expect(result.titles).toHaveLength(PRODUCT_TITLE_MAX_CANDIDATES);
    expect(result.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
    expect(result.titles.map((item) => item.zh)).toEqual(candidatesOf(GOOD_TITLES).map((item) => item.zh));
    expect(result.titles.map((item) => item.overLimit)).toEqual([false, false, false]);
    expect(result.titles.map((item) => item.lint)).toEqual([
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
    ]);
    expect(result.repaired).toBeUndefined();

    // 请求体里不能出现任何密钥
    expect(String(init.body)).not.toContain(DECRYPTED_KEY);
    expect(JSON.stringify(result)).not.toContain(DECRYPTED_KEY);
  });

  it("文本框默认内容（规范 + 补充）作为 user 文本一起发出，规范只出现一次", async () => {
    const description = `${PRODUCT_TITLE_DEFAULT_DESCRIPTION}\n\n折叠晾衣架，家用阳台`;
    await run({ description });

    const body = lastBody();
    expect(String(body.messages[0].content)).toBe(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT);
    const userText = textOfPart(body.messages[1].content);
    expect(userText.startsWith(PRODUCT_TITLE_SPEC)).toBe(true);
    expect(userText).toContain("折叠晾衣架，家用阳台");
    expect(userText.split("1. 标题结构")).toHaveLength(2);
  });

  it("切到「规范放 system」放置时：规范进 system，user 只放文本框内容（依赖注入可切换）", async () => {
    const description = "折叠晾衣架，家用阳台";
    await run({ description }, { specPlacement: "system" });

    const body = lastBody();
    expect(String(body.messages[0].content)).toBe(PRODUCT_TITLE_SYSTEM_PROMPT);
    expect(String(body.messages[0].content)).toContain(PRODUCT_TITLE_SPEC);
    expect(textOfPart(body.messages[1].content)).toBe(description);
  });

  it("逐条 charCount 以服务端复算为准（模型自报 140，实际按每条英文标题长度算，与 zh 长度无关）", async () => {
    const result = await run({ description: "折叠晾衣架" });
    expect(result.titles.map((item) => item.charCount)).toEqual(GOOD_TITLES.map((title) => title.length));
    expect(result.titles.every((item) => item.charCount !== 140)).toBe(true);
    result.titles.forEach((item, index) => expect(item.charCount).toBe(GOOD_TITLES[index].length));
    // zh 的中文对照长度绝不参与 charCount
    result.titles.forEach((item) => expect(item.charCount).not.toBe(item.zh.length));
  });

  it("站内地址（http/相对路径）图片走 loadImageBytes，仍然内联成 data URL", async () => {
    await run({ images: ["/api/media-assets/123e4567-e89b-42d3-a456-426614174000"] });

    expect(loadImageBytes).toHaveBeenCalledWith("/api/media-assets/123e4567-e89b-42d3-a456-426614174000");
    expect(imagesOfPart(lastBody().messages[1].content)).toEqual([COMPRESSED_DATA_URL]);
  });

  it("非 vision 模型（deepseek-v4-pro）+ 图 + 描述：请求体不含任何 image_url，只用文字", async () => {
    const result = await run({
      images: [dataUrl("a"), dataUrl("b")],
      description: "折叠晾衣架",
      model: NON_VISION_MODEL,
    });

    const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(raw).not.toContain("image_url");
    expect(raw).not.toContain("data:image");

    const body = lastBody();
    expect(body.model).toBe(NON_VISION_MODEL);
    expect(imagesOfPart(body.messages[1].content)).toHaveLength(0);
    expect(textOfPart(body.messages[1].content)).toContain("折叠晾衣架");
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

  it("纯描述（vision 模型）+ 无图也能生成，且请求体不含 image_url", async () => {
    const description = "可折叠晾衣架";
    const result = await run({ description, model: PRODUCT_TITLE_DEFAULT_MODEL });

    const raw = String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body);
    expect(raw).not.toContain("image_url");
    const body = lastBody();
    expect(imagesOfPart(body.messages[1].content)).toHaveLength(0);
    // 文本框有内容时就原样发出去，不加任何多余提示
    expect(textOfPart(body.messages[1].content)).toBe(description);
    expect(result.imageCount).toBe(0);
    expect(result.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
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
    const result = await run({ description: "折叠晾衣架" });
    expect(result.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
    expect(result.titles.map((item) => item.charCount)).toEqual(GOOD_TITLES.map((title) => title.length));
  });

  it("模型返回非 JSON 时给可读中文错误，而不是 500 堆栈", async () => {
    fetchMock.mockImplementation(async () => chatResponse("抱歉，我无法根据这些条件生成标题。"));
    await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({
      name: "ProductTitleError",
      code: "PRODUCT_TITLE_INVALID_JSON",
      status: 502,
    });
    await expect(run({ description: "折叠晾衣架" })).rejects.toThrow(/不是可解析的标题 JSON/);
  });

  it("空 titles / 全空字符串 / 旧单条结构 → 可读中文错误（502）", async () => {
    const cases = [
      JSON.stringify({ charCount: 140 }),
      JSON.stringify({ titles: [] }),
      JSON.stringify({ titles: [{ title: "   " }, { title: 42 }, {}] }),
      JSON.stringify({ titles: "not-an-array" }),
      // 旧契约（只有一条 title）不再被接受：契约已经改成 titles[]
      JSON.stringify({ title: GOOD_TITLE, charCount: 60 }),
    ];
    for (const content of cases) {
      fetchMock.mockImplementation(async () => chatResponse(content));
      await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({
        code: "PRODUCT_TITLE_NO_TITLES",
        status: 502,
      });
    }
    fetchMock.mockImplementation(async () => chatResponse(JSON.stringify({ titles: [] })));
    await expect(run({ description: "折叠晾衣架" })).rejects.toThrow(/没有返回可用的商品标题/);
  });

  it("content 为空（推理占满输出）时报可读错误并可重试", async () => {
    fetchMock.mockImplementation(async () => chatResponse("", { reasoning_content: "这里是思考过程，不应展示给用户" }));
    await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_EMPTY_CONTENT",
      status: 502,
    });
    await expect(run({ description: "折叠晾衣架" })).rejects.toThrow(/没有返回标题内容/);
  });

  it("忽略 reasoning_content，只取 content 正文", () => {
    expect(extractChatCompletionText({
      choices: [{ message: { content: VALID_CONTENT, reasoning_content: "思考过程" } }],
    })).toBe(VALID_CONTENT);
    expect(extractChatCompletionText({ choices: [] })).toBe("");
    expect(extractChatCompletionText(null)).toBe("");
  });

  it("parseProductTitles：取 titles[].title 与 titles[].zh，容忍包裹/附加文字/脏项，最多只取 3 条", () => {
    expect(parseProductTitles(VALID_CONTENT)).toEqual(candidatesOf(GOOD_TITLES));
    expect(parseProductTitles("  ```json\n" + VALID_CONTENT + "\n```  ")).toEqual(candidatesOf(GOOD_TITLES));
    expect(parseProductTitles(`好的：\n${VALID_CONTENT}`)).toEqual(candidatesOf(GOOD_TITLES));
    // 少于 3 条也容忍（模型少给不报错）；缺 zh 时按空字符串
    expect(parseProductTitles(JSON.stringify({ titles: [{ title: GOOD_TITLE }] }))).toEqual([
      { title: GOOD_TITLE, zh: "" },
    ]);
    // 模型自报的 charCount 不参与解析结果（zh 照常取到）
    expect(parseProductTitles(JSON.stringify({
      titles: [{ title: "Short Title", zh: "短标题", charCount: 999 }, { title: "Second Title", charCount: 1 }],
    }))).toEqual([
      { title: "Short Title", zh: "短标题" },
      { title: "Second Title", zh: "" },
    ]);
    // 超过 3 条只取前 3 条
    expect(parseProductTitles(JSON.stringify({
      titles: [["A", "甲"], ["B", "乙"], ["C", "丙"], ["D", "丁"]].map(([title, zh]) => ({ title, zh })),
    }))).toEqual([
      { title: "A", zh: "甲" },
      { title: "B", zh: "乙" },
      { title: "C", zh: "丙" },
    ]);
    // 数组里混入字符串/空项就跳过（zh 为空仍然保留那一条）
    expect(parseProductTitles(JSON.stringify({
      titles: [{ title: "A", zh: "甲" }, "B", { title: "   " }, { title: "C" }],
    }))).toEqual([
      { title: "A", zh: "甲" },
      { title: "C", zh: "" },
    ]);
    expect(() => parseProductTitles("")).toThrow(ProductTitleError);
    expect(() => parseProductTitles('{"titles":[{"en":"A"}]}')).toThrow(/没有返回可用的商品标题/);
  });

  it("parseProductTitles：zh 缺失/非字符串/空串/空白一律按空字符串，绝不因此报错", () => {
    const entries = [
      { title: "A" },
      { title: "B", zh: 42 },
      { title: "C", zh: null },
      { title: "D", zh: "   " },
      { title: "E", zh: { text: "对象" } },
      { title: "F", zh: "" },
    ];
    expect(parseProductTitles(JSON.stringify({ titles: entries }))).toEqual([
      { title: "A", zh: "" },
      { title: "B", zh: "" },
      { title: "C", zh: "" },
      { title: "D", zh: "" },
      { title: "E", zh: "" },
      { title: "F", zh: "" },
    ].slice(0, PRODUCT_TITLE_MAX_CANDIDATES));
  });

  it("每条都带出中文对照 zh；zh 只作对照，charCount 仍按英文 title 复算", async () => {
    const result = await run({ description: "折叠晾衣架" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.zh)).toEqual([
      "第 1 条中文对照",
      "第 2 条中文对照",
      "第 3 条中文对照",
    ]);
    expect(result.titles.map((item) => item.charCount)).toEqual(GOOD_TITLES.map((title) => title.length));
    expect(result.repaired).toBeUndefined();
  });

  it("zh 里出现材质/禁词/尺寸词绝不触发 lint（英文干净 → hits 为空、不重试）", async () => {
    // 反例：英文 title 完全干净，但中文对照里出现「不锈钢」「45cm」「环保」「安全」「超细纤维」等
    fetchMock.mockImplementation(async () => chatResponse(JSON.stringify({
      titles: [
        { title: GOOD_TITLES[0], zh: "不锈钢折叠晾衣架，45cm 加厚，环保可回收材质", charCount: 999 },
        { title: GOOD_TITLES[1], zh: "超细纤维拖把头，500ml 容量，Safe 安全无害", charCount: 999 },
        { title: GOOD_TITLES[2], zh: "2-pack 可折叠，棉质面料", charCount: 999 },
      ],
    })));

    const result = await run({ description: "折叠晾衣架" });

    // 没有命中 → 只请求一次（没有触发带纠正指令的重写重试）
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
    expect(result.titles.map((item) => item.zh)).toEqual([
      "不锈钢折叠晾衣架，45cm 加厚，环保可回收材质",
      "超细纤维拖把头，500ml 容量，Safe 安全无害",
      "2-pack 可折叠，棉质面料",
    ]);
    expect(result.titles.map((item) => item.lint)).toEqual([
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
    ]);
    expect(result.titles.map((item) => item.overLimit)).toEqual([false, false, false]);
    expect(result.repaired).toBeUndefined();
  });

  it("zh 缺失/非字符串/空串一律按空字符串处理，不报错、不触发重试", async () => {
    fetchMock.mockImplementation(async () => chatResponse(JSON.stringify({
      titles: [
        { title: GOOD_TITLES[0], charCount: 999 },
        { title: GOOD_TITLES[1], zh: 42, charCount: 999 },
        { title: GOOD_TITLES[2], zh: "   ", charCount: 999 },
      ],
    })));

    const result = await run({ description: "折叠晾衣架" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
    expect(result.titles.map((item) => item.zh)).toEqual(["", "", ""]);
    expect(result.titles.map((item) => item.charCount)).toEqual(GOOD_TITLES.map((title) => title.length));
    expect(result.repaired).toBeUndefined();
  });

  it("提示词：文本框内容原样带上；多图才追加综合提示；文本框为空时不编造", () => {
    // 文本框内容（默认规范 + 用户补充）原样作为 user 文本，不额外拼接
    const typed = buildProductTitleOperationalNotes({ description: "折叠晾衣架，家用阳台", imageCount: 1 });
    expect(typed).toBe("");

    const multi = buildProductTitleOperationalNotes({ description: "折叠晾衣架，家用阳台", imageCount: 2 });
    expect(multi).toContain("2 张商品图片");
    expect(multi).not.toContain("不要编造图片里看不到的信息");

    const textOnly = buildProductTitleOperationalNotes({ description: "可折叠晾衣架", imageCount: 0 });
    expect(textOnly).toBe("");

    const imageOnly = buildProductTitleOperationalNotes({ description: "", imageCount: 1 });
    expect(imageOnly).toContain("文本框为空");
    expect(imageOnly).toContain("不要编造图片里看不到的信息");

    // 只有图（文本框被清空）时 user 文本 = 提示，且不含规范
    const messages = buildProductTitleMessages({ description: "   ", imageCount: 1 });
    expect(textOfPart(messages[1].content)).toBe(imageOnly);
  });

  it("超长只标注 overLimit：不改写、不重试（fetch 只调用一次，repaired 不出现）", async () => {
    expect(OVER_LONG_TITLE.length).toBeGreaterThan(PRODUCT_TITLE_MAX_CHARS);
    fetchMock.mockImplementation(async () => chatResponse(titlesContent([GOOD_TITLES[0], OVER_LONG_TITLE, GOOD_TITLES[2]])));

    const result = await run({ description: "折叠晾衣架" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.title)).toEqual([GOOD_TITLES[0], OVER_LONG_TITLE, GOOD_TITLES[2]]);
    // 用服务端复算的长度判断（模型自报的 140 不作数）
    expect(result.titles.map((item) => item.charCount)).toEqual([
      GOOD_TITLES[0].length,
      OVER_LONG_TITLE.length,
      GOOD_TITLES[2].length,
    ]);
    expect(result.titles.map((item) => item.overLimit)).toEqual([false, true, false]);
    expect(result.titles.every((item) => item.lint?.hits.length === 0)).toBe(true);
    expect(result.repaired).toBeUndefined();
  });

  it("3 条都超长也照常返回（逐条 overLimit:true）、不报错、不重试", async () => {
    fetchMock.mockImplementation(async () => chatResponse(titlesContent([OVER_LONG_TITLE, OVER_LONG_TITLE, OVER_LONG_TITLE])));

    const result = await run({ description: "折叠晾衣架" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.charCount)).toEqual(Array(3).fill(OVER_LONG_TITLE.length));
    expect(result.titles.map((item) => item.overLimit)).toEqual([true, true, true]);
    expect(result.titles.every((item) => item.lint?.hits.length === 0)).toBe(true);
    expect(result.repaired).toBeUndefined();
  });

  it("短于 200 字符也照常返回：规范里的「超过200个字符」不做硬校验、不报错、不重试", async () => {
    const shortTitles = ["Foldable Drying Rack", "Space Saving Hanger", "Portable Laundry Airer"];
    fetchMock.mockImplementation(async () => chatResponse(titlesContent(shortTitles)));

    const result = await run({ description: "折叠晾衣架" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.title)).toEqual(shortTitles);
    expect(result.titles.every((item) => item.charCount < 200)).toBe(true);
    expect(result.titles.map((item) => item.overLimit)).toEqual([false, false, false]);
    expect(result.repaired).toBeUndefined();
  });

  it("只有命中禁词才重试一次：逐条列出「第几条 + 命中原词」，第二次干净就返回第二次的 3 条", async () => {
    const first = titlesContent([
      GOOD_TITLES[0],
      "Eco Friendly Safe Drying Rack for Balcony, Space Saving Airer",
      GOOD_TITLES[2],
    ]);
    fetchMock
      .mockImplementationOnce(async () => chatResponse(first))
      .mockImplementationOnce(async () => chatResponse(CLEAN_CONTENT));

    const result = await run({ description: "折叠晾衣架" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = lastBody();
    expect(retryBody.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    // 前两条仍然只由拼装函数生成（规范在 user 文本里，system 只放最小契约）
    expect(retryBody.messages[0]).toEqual(buildProductTitleMessages({ description: "折叠晾衣架", imageCount: 0 })[0]);
    expect(retryBody.messages[0].content).toBe(PRODUCT_TITLE_MINIMAL_SYSTEM_PROMPT);
    expect(retryBody.messages[2].content).toBe(first);
    const instruction = String(retryBody.messages[3].content);
    // 只点名第 2 条，并逐字带上命中的禁词原词（第 1、3 条干净，不进纠正指令）
    const expectedInstruction = buildProductTitleRepairInstruction({
      items: [{ index: 2, forbiddenHits: ["Eco", "Safe"] }],
    });
    expect(instruction).toBe(expectedInstruction);
    expect(instruction).toContain('第 2 条标题违反了规则：出现了禁词 "Eco"、"Safe"');
    expect(instruction).toContain("仍然只返回同样的 JSON");
    expect(instruction).toContain(`仍然必须返回 ${PRODUCT_TITLE_MAX_CANDIDATES} 条候选英文标题`);
    expect(instruction).not.toContain("第 1 条标题");
    // 纠正指令只说禁词：绝不再出现「去掉材质词 / 尺寸数字」这类旧说法
    expect(instruction).not.toContain("去掉所有材质词");
    expect(instruction).not.toContain("尺寸/容量/规格数字");
    // 重试请求仍然带着原来的 user 输入
    expect(textOfPart(retryBody.messages[1].content)).toContain("折叠晾衣架");

    expect(result.titles.map((item) => item.title)).toEqual(CLEAN_TITLES);
    expect(result.repaired).toBe(true);
    expect(result.titles.every((item) => item.lint?.hits.length === 0)).toBe(true);
  });

  it("材质词与尺寸/容量数字原样保留、不触发重试（新规范要求标题里就有材质与容量/尺寸）", async () => {
    const withMaterialAndSize = [
      "Stainless Steel Spin Mop with Microfiber Cleaning Head, 45cm Adjustable Handle",
      "500ml Water Spray Bottle with Microfiber Cloth for Home Cleaning",
      "2-pack Foldable Laundry Rack, Stainless Steel, 30 inch Space Saving Airer",
    ];
    fetchMock.mockImplementation(async () => chatResponse(titlesContent(withMaterialAndSize)));

    const result = await run({ description: "超细纤维清洁头" });

    // 没有禁词 → 只请求一次；标题一个字都没被改写
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.titles.map((item) => item.title)).toEqual(withMaterialAndSize);
    expect(result.titles.map((item) => item.charCount)).toEqual(withMaterialAndSize.map((title) => title.length));
    expect(result.titles.map((item) => item.lint)).toEqual([
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
      { hasForbidden: false, hits: [] },
    ]);
    expect(result.titles.map((item) => item.overLimit)).toEqual([false, false, false]);
    expect(result.repaired).toBeUndefined();
  });

  it("重试后仍有禁词命中：照常返回（不静默改写）+ 逐条 lint.hits + repaired:false", async () => {
    fetchMock.mockImplementation(async () => chatResponse(titlesContent([
      "Safe Microfiber Mop Head 45cm Washable",
      GOOD_TITLES[1],
      "Recyclable Storage Basket with Microfiber Cloth",
    ])));

    const result = await run({ description: "超细纤维清洁头" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 逐条标注：只有命中禁词的那两条带 hits（材质/尺寸词不算），干净的那条是空数组
    expect(result.titles[0]).toEqual({
      title: "Safe Microfiber Mop Head 45cm Washable",
      zh: "第 1 条中文对照",
      charCount: "Safe Microfiber Mop Head 45cm Washable".length,
      overLimit: false,
      lint: { hasForbidden: true, hits: ["Safe"] },
    });
    expect(result.titles[1].lint).toEqual({ hasForbidden: false, hits: [] });
    expect(result.titles[2].lint?.hits).toEqual(["Recyclable"]);
    expect(result.titles[2].overLimit).toBe(false);
    expect(result.repaired).toBe(false);
  });

  it("重写那一轮返回不可解析内容时：保留第一次的 3 条结果并标 repaired:false，不把请求判失败", async () => {
    const dirty = titlesContent([
      "Safe Microfiber Mop Head Washable",
      GOOD_TITLES[1],
      GOOD_TITLES[2],
    ]);
    fetchMock
      .mockImplementationOnce(async () => chatResponse(dirty))
      .mockImplementationOnce(async () => chatResponse("好的，这是我重写后的标题。"));

    const result = await run({ description: "超细纤维清洁头" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.titles.map((item) => item.title)).toEqual([
      "Safe Microfiber Mop Head Washable",
      GOOD_TITLES[1],
      GOOD_TITLES[2],
    ]);
    expect(result.titles[0].charCount).toBe("Safe Microfiber Mop Head Washable".length);
    expect(result.titles[0].lint?.hits).toEqual(["Safe"]);
    expect(result.repaired).toBe(false);
  });

  it("模型少给（1 条）照常返回；超发（4 条）只取前 3 条", async () => {
    fetchMock.mockImplementationOnce(async () => chatResponse(titlesContent([GOOD_TITLES[0]])));
    const one = await run({ description: "折叠晾衣架" });
    expect(one.titles).toHaveLength(1);
    expect(one.titles[0].title).toBe(GOOD_TITLES[0]);
    expect(one.repaired).toBeUndefined();

    fetchMock.mockImplementation(async () => chatResponse(titlesContent([...GOOD_TITLES, "Fourth Extra Candidate Title"])));
    const four = await run({ description: "折叠晾衣架" });
    expect(four.titles.map((item) => item.title)).toEqual(GOOD_TITLES);
  });

  it("3 条都干净时不发第二次请求", async () => {
    const result = await run({ description: "折叠晾衣架" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBeUndefined();
    expect(result.titles.every((item) => item.lint?.hasForbidden === false)).toBe(true);
  });

  it("上游非 2xx 时只暴露状态码，不回传上游响应全文", async () => {
    fetchMock.mockImplementation(async () => new Response("upstream-secret-detail-不能外泄", { status: 500 }));
    const error = await run({ description: "折叠晾衣架" }).catch((thrown: unknown) => thrown);
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
    await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({ code: "PRODUCT_TITLE_TIMEOUT", status: 504 });

    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({ code: "PRODUCT_TITLE_UPSTREAM_UNAVAILABLE", status: 502 });
  });

  it("上游 200 但响应体不是 JSON 时给可读错误", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>bad gateway</html>", { status: 200 }));
    await expect(run({ description: "折叠晾衣架" })).rejects.toMatchObject({
      code: "PRODUCT_TITLE_UPSTREAM_INVALID_RESPONSE",
      status: 502,
    });
  });
});
