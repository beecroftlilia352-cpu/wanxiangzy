/**
 * 「商品标题」服务端模块（第二版：用户自选条件 → 3 条双语标题）。
 *
 * 流程：用户条件（0~5 张图片 + 文字描述 + 模型版本）
 *      → 每张图用 sharp 压成 jpeg（长边 ≤1024, q80）→ base64 data URL 内联
 *      → DeepSeek OpenAI 兼容 /chat/completions → 解析 JSON。
 *
 * 为什么直接读 provider 而不走 executeLlmChatRouted：
 *   控制面里的 "deepseek" 供应商刻意没有任何 deployments/models（不参与用户可见的
 *   模型路由），所以没有 deployment 可以选；这里直接取 provider 对象拿 baseUrl 与
 *   解密后的 apiKey。
 *
 * 为什么必须内联 base64：内网地址（http://192.168.x.x:3000/api/media-assets/<id> 或对象存储
 *   签名读地址）DeepSeek 云端取不到，只能把图片字节直接放进请求体。实测 5 张真实商品图
 *   （压缩后单张 176~263KB）→ 请求体 1.39MB → 上游 HTTP 200、约 3 秒返回。
 *
 * 模型能力：模型清单来自 GET /models（见 ./models.ts，5 分钟缓存）。deepseek-v4-pro 不支持
 *   图片输入，对它**绝不发送 image content part**，只用文字描述生成；此时若用户只给了图、
 *   没有文字描述 → 400 + 中文提示（前端可直接展示）。
 *
 * 安全：apiKey 只在服务端内存中使用，不返回前端、不写日志；上游错误只暴露状态码。
 */

import sharp from "sharp";
import { buildAiAdapterAuthHeaders, resolveAiAdapterUrl } from "@/lib/ai-control-plane/adapters";
import { getAiControlPlaneConfig } from "@/lib/ai-control-plane/server";
import type { AiControlPlaneConfig, AiProviderEndpoint } from "@/lib/ai-control-plane/types";
import { extractMediaAssetIdFromUrl } from "@/lib/api/kie-reference-image.server";
import { getProductTitleModelCatalog } from "./models";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_ERROR_CODES,
  PRODUCT_TITLE_IMAGE_JPEG_QUALITY,
  PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
  PRODUCT_TITLE_MAX_CANDIDATES,
  PRODUCT_TITLE_MAX_IMAGE_BYTES,
  PRODUCT_TITLE_MAX_IMAGES,
  PRODUCT_TITLE_MAX_TOKENS,
  PRODUCT_TITLE_MODEL_ENV,
  PRODUCT_TITLE_PROVIDER_ID,
  PRODUCT_TITLE_TIMEOUT_MS,
  type ProductTitleCandidate,
} from "./types";

/** 本功能自己的错误类型：携带面向用户的中文提示与 HTTP 状态码。 */
export class ProductTitleError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ProductTitleError";
    this.code = code;
    this.status = status;
  }
}

export type ProductTitleImageBytes = {
  bytes: Buffer;
  contentType?: string;
  /** 诊断用标识（assetId 或主机名），不写完整内网 URL。 */
  sourceId?: string;
};

export type ProductTitleDependencies = {
  /** 控制面配置注入（测试用）；默认 getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true })。 */
  config?: AiControlPlaneConfig | null;
  /** 图片字节读取注入（测试用）；默认走媒体资产注册表 / 对象存储签名读。 */
  loadImageBytes?: (imageUrl: string) => Promise<ProductTitleImageBytes>;
  /** fetch 注入（测试用）；默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 模型名注入（测试用；一般由请求入参决定）。 */
  model?: string;
};

/** 生成条件：图片（data URL 或站内地址）+ 文字描述 + 模型版本；三者可选，但图片与描述至少要有其一。 */
export type ProductTitleGenerateInput = {
  images?: string[];
  description?: string;
  model?: string;
};

export type ProductTitleGenerationResult = {
  model: string;
  /** 该模型是否支持图片输入。 */
  vision: boolean;
  titles: ProductTitleCandidate[];
  /** 实际内联给上游的图片张数（非 vision 模型恒为 0）。 */
  imageCount: number;
  /** 实际内联给上游的图片压缩字节总量。 */
  imageBytes: number;
};

const SYSTEM_PROMPT = `你是资深跨境电商运营，长期负责欧美市场（Amazon / Etsy / Shopify）的商品上架。
你的任务：根据用户提供的商品图片与文字描述（可能只有其一），判断商品的品类、主体、材质、颜色、风格
与典型使用场景，写出可直接上架的英文商品标题，并给出中文对照。

必须遵守：
1. 标题为纯英文，长度尽量落在 120~200 个字符之间，词序按欧美买家的搜索习惯排列
   （核心品类词 + 关键属性 + 使用场景/受众）。
2. 若收到多张图片，且它们属于同一商品的多个角度、多个部件或组成套装，请综合所有图片的信息产出
   统一的商品标题（例如把多个部件概括成一个套装卖点），不要只描述其中一张。
3. 文字描述用于补充图片里看不到的信息（材质、尺寸、用途等）；描述与图片冲突时，以图片中真实
   可见的信息为准。只有文字描述、没有图片时，完全基于描述写标题，不要编造描述里没有的细节。
4. 只客观描述真实可见或用户明确给出的信息，不夸大、不承诺效果。
5. 禁止使用 best、No.1、#1、free、cheapest、guarantee、100% off 等违反平台规范的词。
6. 不编造具体品牌名；确有必要时用 [Brand] 占位。
7. 中文对照是英文标题的准确翻译，不要额外发挥。
8. 只输出 JSON，不要输出解释、标题、列表符号或额外文字。`;

/** 模型名：显式入参优先，其次 PRODUCT_TITLE_MODEL 环境变量，最后默认 deepseek-flash。 */
export function resolveProductTitleModel(override?: string): string {
  const candidate = (override ?? process.env[PRODUCT_TITLE_MODEL_ENV] ?? "").trim();
  return candidate || PRODUCT_TITLE_DEFAULT_MODEL;
}

/** 从控制面里取已启用且带解密 key 的 DeepSeek 供应商。 */
export async function resolveDeepseekProvider(
  dependencies: ProductTitleDependencies = {},
): Promise<AiProviderEndpoint & { apiKey: string }> {
  const config = dependencies.config !== undefined
    ? dependencies.config
    : await getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true });
  const provider = config?.providers?.find(
    (item) => item.id === PRODUCT_TITLE_PROVIDER_ID && item.enabled,
  );
  if (!provider) {
    throw new ProductTitleError(
      "商品标题功能暂不可用：模型控制台里找不到已启用的 DeepSeek 供应商，请联系管理员。",
      "PRODUCT_TITLE_PROVIDER_UNAVAILABLE",
      503,
    );
  }
  const apiKey = (provider.apiKey || "").trim();
  if (!apiKey) {
    throw new ProductTitleError(
      "商品标题功能暂不可用：DeepSeek 供应商未配置 API Key，请联系管理员。",
      "PRODUCT_TITLE_PROVIDER_KEY_MISSING",
      503,
    );
  }
  if (!provider.baseUrl?.trim()) {
    throw new ProductTitleError(
      "商品标题功能暂不可用：DeepSeek 供应商未配置 Base URL，请联系管理员。",
      "PRODUCT_TITLE_PROVIDER_BASE_URL_MISSING",
      503,
    );
  }
  return { ...provider, apiKey };
}

/**
 * 生成商品标题：按「图片 + 文字描述 + 模型版本」多重条件。
 * 所有失败都抛 ProductTitleError（含中文提示与状态码）。
 */
export async function generateProductTitles(
  input: ProductTitleGenerateInput,
  dependencies: ProductTitleDependencies = {},
): Promise<ProductTitleGenerationResult> {
  const provider = await resolveDeepseekProvider(dependencies);
  const loadImageBytes = dependencies.loadImageBytes ?? loadProductTitleImageBytes;
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  const description = (input.description ?? "").trim();
  const requestedImages = (input.images ?? []).map((value) => value.trim()).filter(Boolean);
  if (requestedImages.length > PRODUCT_TITLE_MAX_IMAGES) {
    throw new ProductTitleError(
      `最多只能上传 ${PRODUCT_TITLE_MAX_IMAGES} 张图片（当前 ${requestedImages.length} 张），请删掉多余的再试。`,
      PRODUCT_TITLE_ERROR_CODES.tooManyImages,
      400,
    );
  }

  // 与 GET /api/product-title/models 共用同一份能力表（同一份 5 分钟缓存）。
  const catalog = getProductTitleModelCatalog();
  const model = resolveProductTitleModel(input.model ?? dependencies.model);
  const selected = catalog.models.find((item) => item.id === model);
  if (!selected) {
    throw new ProductTitleError(
      `不支持所选的模型版本（${model}），请刷新模型列表后重试。`,
      PRODUCT_TITLE_ERROR_CODES.modelNotSupported,
      400,
    );
  }
  const vision = selected.vision;

  if (!requestedImages.length && !description) {
    throw new ProductTitleError(
      `请至少上传 1 张图片或填写商品描述（最多 ${PRODUCT_TITLE_MAX_IMAGES} 张图片）后再生成。`,
      PRODUCT_TITLE_ERROR_CODES.inputRequired,
      400,
    );
  }
  // 非 vision 模型看不到图片：只给图不给描述时直接给可读中文提示，不打上游。
  if (!vision && requestedImages.length && !description) {
    throw new ProductTitleError(
      `${model} 不支持图片输入，请填写文字描述或改用 ${PRODUCT_TITLE_DEFAULT_MODEL}。`,
      PRODUCT_TITLE_ERROR_CODES.modelRequiresText,
      400,
    );
  }

  const imageDataUrls: string[] = [];
  let imageBytes = 0;
  if (vision) {
    for (const image of requestedImages) {
      const prepared = await prepareProductTitleImage(image, { loadImageBytes });
      imageDataUrls.push(prepared.dataUrl);
      imageBytes += prepared.bytes;
    }
  }

  const endpoint = resolveAiAdapterUrl({
    baseUrl: provider.baseUrl,
    protocol: "openai-chat",
    operation: "generation",
  });
  const headers: Record<string, string> = {
    ...buildAiAdapterAuthHeaders({ protocol: "openai-chat", apiKey: provider.apiKey }),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const timeoutMs = Math.min(provider.timeoutMs || PRODUCT_TITLE_TIMEOUT_MS, PRODUCT_TITLE_TIMEOUT_MS);

  const userText = buildProductTitleUserPrompt({ description, imageCount: imageDataUrls.length });
  const requestBody = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        // 有图 → 多模态 content parts；纯文字（或非 vision 模型）→ 纯字符串，绝不带 image_url。
        content: imageDataUrls.length
          ? [
              { type: "text", text: userText },
              ...imageDataUrls.map((url) => ({ type: "image_url", image_url: { url } })),
            ]
          : userText,
      },
    ],
    stream: false,
    temperature: 0.7,
    max_tokens: PRODUCT_TITLE_MAX_TOKENS,
    // deepseek-flash 是推理模型：必须显式关闭 thinking，否则 max_tokens 会被推理过程吃光、
    // 出现「HTTP 200 但 content 为空」。
    thinking: { type: "disabled" },
  };

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const aborted = error instanceof Error
      && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ProductTitleError(
      aborted ? "生成商品标题超时，请重试。" : "无法连接 DeepSeek 服务，请稍后重试。",
      aborted ? "PRODUCT_TITLE_TIMEOUT" : "PRODUCT_TITLE_UPSTREAM_UNAVAILABLE",
      aborted ? 504 : 502,
    );
  }

  if (!response.ok) {
    // 只回状态码，绝不把上游响应正文抛给前端。
    throw new ProductTitleError(
      `DeepSeek 服务返回错误（HTTP ${response.status}），请稍后重试。`,
      `PRODUCT_TITLE_UPSTREAM_HTTP_${response.status}`,
      502,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProductTitleError("DeepSeek 返回内容不是合法 JSON，请重试。", "PRODUCT_TITLE_UPSTREAM_INVALID_RESPONSE", 502);
  }

  const titles = parseProductTitles(extractChatCompletionText(payload));
  return { model, vision, titles, imageCount: imageDataUrls.length, imageBytes };
}

/** 组装送给模型的用户提示词（图片张数 / 文字描述 / 输出格式）。 */
export function buildProductTitleUserPrompt(input: { description: string; imageCount: number }): string {
  const parts: string[] = [];
  if (input.imageCount > 1) {
    parts.push(
      `请综合这 ${input.imageCount} 张商品图片生成 3 条面向欧美买家的英文商品标题：它们可能是同一商品的`
      + "不同角度或不同部件（也可能组成套装），请综合所有图片的信息给出统一标题，不要只描述其中一张。"
      + "三条标题的角度必须各不相同：",
    );
  } else if (input.imageCount === 1) {
    parts.push("请根据这张商品图片生成 3 条面向欧美买家的英文商品标题，三条的角度必须各不相同：");
  } else {
    parts.push("请只根据下面的文字描述生成 3 条面向欧美买家的英文商品标题，三条的角度必须各不相同：");
  }
  parts.push("第 1 条偏功能与卖点，第 2 条偏使用场景与目标人群，第 3 条偏材质与规格。");
  if (input.description) {
    parts.push(`商品文字描述（用户提供，按它补充图片里看不到的信息）：\n${input.description}`);
  }
  if (!input.imageCount) {
    parts.push("没有图片可用，请完全基于上面的文字描述写标题，不要编造描述里没有的细节。");
  }
  parts.push(
    "只输出下面这个 JSON（不要输出任何其他内容）：\n"
    + '{"titles":[{"en":"英文标题","zh":"中文对照","angle":"这条标题的卖点角度，20 字以内的中文"}]}',
  );
  return parts.join("\n\n");
}

/**
 * 取 choices[0].message.content。
 * reasoning_content（推理过程）刻意不读、不返回：只暴露正文，避免把思考内容展示给用户。
 */
export function extractChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: unknown } | null)?.message;
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** 容错解析模型输出的标题 JSON（容忍 ```json 包裹、前后附加文字）。 */
export function parseProductTitles(content: string): ProductTitleCandidate[] {
  const text = stripCodeFence(typeof content === "string" ? content : "").trim();
  if (!text) {
    throw new ProductTitleError(
      "模型没有返回标题内容（输出可能被推理过程占用），请点击重试。",
      "PRODUCT_TITLE_EMPTY_CONTENT",
      502,
    );
  }
  const segment = extractJsonSegment(text);
  if (!segment) {
    throw new ProductTitleError("模型返回的内容不是可解析的标题 JSON，请重试。", "PRODUCT_TITLE_INVALID_JSON", 502);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(segment);
  } catch {
    throw new ProductTitleError("模型返回的内容不是可解析的标题 JSON，请重试。", "PRODUCT_TITLE_INVALID_JSON", 502);
  }

  const rawList = readTitleList(parsed);
  const titles = rawList
    .map(normalizeCandidate)
    .filter((item): item is ProductTitleCandidate => item !== null)
    .slice(0, PRODUCT_TITLE_MAX_CANDIDATES);
  if (!titles.length) {
    throw new ProductTitleError("模型没有返回可用的商品标题，请重试。", "PRODUCT_TITLE_NO_TITLES", 502);
  }
  return titles;
}

/** 解 data URL → 字节（图片类型与空内容在这里兜底）。 */
export function decodeProductTitleImageDataUrl(value: string): { bytes: Buffer; contentType: string } {
  const match = /^data:([a-z0-9.+_/-]+);base64,([\s\S]*)$/i.exec(typeof value === "string" ? value.trim() : "");
  if (!match) {
    throw new ProductTitleError(
      "图片数据格式不正确，请重新选择图片后重试。",
      PRODUCT_TITLE_ERROR_CODES.imageInvalid,
      400,
    );
  }
  const contentType = match[1].toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new ProductTitleError(
      "只支持图片文件，请重新选择图片后重试。",
      PRODUCT_TITLE_ERROR_CODES.imageInvalid,
      400,
    );
  }
  const bytes = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!bytes.length) {
    throw new ProductTitleError("图片内容为空，请重新选择图片后重试。", PRODUCT_TITLE_ERROR_CODES.imageEmpty, 400);
  }
  return { bytes, contentType };
}

/** 单张图 → 压缩后的 jpeg data URL（data URL 直接解字节；站内地址走资产读取路径）。 */
async function prepareProductTitleImage(
  image: string,
  dependencies: { loadImageBytes: (imageUrl: string) => Promise<ProductTitleImageBytes> },
): Promise<{ dataUrl: string; bytes: number }> {
  const raw = image.startsWith("data:")
    ? decodeProductTitleImageDataUrl(image).bytes
    : (await dependencies.loadImageBytes(image)).bytes;

  if (!raw?.length) {
    throw new ProductTitleError("图片内容为空，请重新选择图片后重试。", PRODUCT_TITLE_ERROR_CODES.imageEmpty, 400);
  }
  if (raw.byteLength > PRODUCT_TITLE_MAX_IMAGE_BYTES) {
    throw new ProductTitleError(
      `图片文件超过 ${formatMegabytes(PRODUCT_TITLE_MAX_IMAGE_BYTES)} 上限，请压缩或换一张更小的图片。`,
      PRODUCT_TITLE_ERROR_CODES.imageTooLarge,
      413,
    );
  }

  const compressed = await compressProductTitleImage(raw);
  if (compressed.byteLength > PRODUCT_TITLE_MAX_IMAGE_BYTES) {
    throw new ProductTitleError(
      `图片压缩后仍超过 ${formatMegabytes(PRODUCT_TITLE_MAX_IMAGE_BYTES)} 上限，请换一张更小的图片。`,
      PRODUCT_TITLE_ERROR_CODES.imageTooLarge,
      413,
    );
  }
  return {
    dataUrl: `data:image/jpeg;base64,${compressed.toString("base64")}`,
    bytes: compressed.byteLength,
  };
}

/** 压缩成 jpeg：长边 ≤1024、quality 80。 */
export async function compressProductTitleImage(source: Buffer): Promise<Buffer> {
  try {
    return await sharp(source)
      .rotate()
      .resize({
        width: PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
        height: PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: PRODUCT_TITLE_IMAGE_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new ProductTitleError(
      "图片无法解析或压缩，请换一张图片后重试。",
      PRODUCT_TITLE_ERROR_CODES.imageInvalid,
      400,
    );
  }
}

/**
 * 默认字节读取：先按媒体资产注册表取（与 lib/api/kie-reference-image.server.ts 一致的做法）：
 * resolve_media_asset_object → createAliyunOssRegistryReadUrl → GET；其它地址（对象存储签名读
 * 地址等）直接 GET，绝不 HTTP 回打本应用自己的路由。
 */
export async function loadProductTitleImageBytes(imageUrl: string): Promise<ProductTitleImageBytes> {
  const assetId = extractMediaAssetIdFromUrl(imageUrl);
  if (assetId) return loadMediaAssetBytes(assetId);

  if (!/^https?:\/\//i.test(imageUrl)) {
    throw new ProductTitleError("图片地址无法识别，请重新选择图片。", PRODUCT_TITLE_ERROR_CODES.imageUrlInvalid, 400);
  }
  let response: Response;
  try {
    response = await fetch(imageUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(PRODUCT_TITLE_TIMEOUT_MS) });
  } catch {
    throw new ProductTitleError("图片读取失败，请稍后重试。", "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  if (!response.ok) {
    throw new ProductTitleError(`图片读取失败（HTTP ${response.status}），请重新选择图片。`, "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || undefined,
  };
}

async function loadMediaAssetBytes(assetId: string): Promise<ProductTitleImageBytes> {
  const bucketName = process.env.ALIYUN_OSS_BUCKET?.trim();
  if (!bucketName) {
    throw new ProductTitleError("图片存储未配置，无法读取图片，请联系管理员。", "PRODUCT_TITLE_STORAGE_NOT_CONFIGURED", 503);
  }
  const [{ getAdminClient }, { createAliyunOssRegistryReadUrl }] = await Promise.all([
    import("@/lib/supabase/admin"),
    import("@/lib/api/media-storage"),
  ]);

  let resolved: { data: unknown; error: unknown };
  try {
    resolved = await getAdminClient().rpc("resolve_media_asset_object", { p_asset_id: assetId });
  } catch {
    throw new ProductTitleError("图片存储暂时不可用，请稍后重试。", "PRODUCT_TITLE_ASSET_LOOKUP_FAILED", 502);
  }
  if (resolved.error) {
    throw new ProductTitleError("图片存储查询失败，请稍后重试。", "PRODUCT_TITLE_ASSET_LOOKUP_FAILED", 502);
  }
  const row = Array.isArray(resolved.data) && resolved.data[0] && typeof resolved.data[0] === "object"
    ? resolved.data[0] as { object_key?: unknown; status?: unknown; mime_type?: unknown }
    : null;
  if (!row || row.status !== "verified" || typeof row.object_key !== "string") {
    throw new ProductTitleError("图片不可读或尚未完成安全校验，请重新选择图片。", "PRODUCT_TITLE_ASSET_UNAVAILABLE", 400);
  }

  let signedUrl: string;
  try {
    signedUrl = createAliyunOssRegistryReadUrl(row.object_key, bucketName);
  } catch {
    throw new ProductTitleError("图片存储配置异常，无法读取图片，请联系管理员。", "PRODUCT_TITLE_STORAGE_NOT_CONFIGURED", 503);
  }
  let response: Response;
  try {
    response = await fetch(signedUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(PRODUCT_TITLE_TIMEOUT_MS) });
  } catch {
    throw new ProductTitleError("图片读取失败，请稍后重试。", "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  if (!response.ok) {
    throw new ProductTitleError(`图片读取失败（HTTP ${response.status}），请重新选择图片。`, "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: typeof row.mime_type === "string" ? row.mime_type : response.headers.get("content-type") || undefined,
    sourceId: assetId,
  };
}

function stripCodeFence(value: string): string {
  const fenced = value.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : value;
}

function extractJsonSegment(value: string): string | null {
  const starts = [value.indexOf("{"), value.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const end = Math.max(value.lastIndexOf("}"), value.lastIndexOf("]"));
  if (end <= start) return null;
  return value.slice(start, end + 1);
}

function readTitleList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const titles = (parsed as { titles?: unknown }).titles;
    if (Array.isArray(titles)) return titles;
  }
  return [];
}

function normalizeCandidate(value: unknown): ProductTitleCandidate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { en?: unknown; zh?: unknown; angle?: unknown };
  const en = readText(record.en);
  if (!en) return null;
  return {
    en,
    zh: readText(record.zh) || en,
    angle: readText(record.angle),
  };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}
