/**
 * 「商品标题」服务端模块。
 *
 * 流程：结果图（内网地址/相对路径）→ 读字节 → sharp 压成 jpeg（长边 ≤1024, q80）
 *      → base64 data URL → DeepSeek OpenAI 兼容 /chat/completions（多模态）→ 解析 JSON。
 *
 * 为什么直接读 provider 而不走 executeLlmChatRouted：
 *   控制面里的 "deepseek" 供应商刻意没有任何 deployments/models（不参与用户可见的
 *   模型路由），所以没有 deployment 可以选；这里直接取 provider 对象拿 baseUrl 与
 *   解密后的 apiKey。
 *
 * 为什么必须内联 base64：结果图是内网地址（http://192.168.x.x:3000/api/media-assets/<id>
 *   或对象存储签名读地址），DeepSeek 云端取不到，只能把图片字节直接放进请求体。
 *
 * 安全：apiKey 只在服务端内存中使用，不返回前端、不写日志；上游错误只暴露状态码。
 */

import sharp from "sharp";
import { buildAiAdapterAuthHeaders, resolveAiAdapterUrl } from "@/lib/ai-control-plane/adapters";
import { getAiControlPlaneConfig } from "@/lib/ai-control-plane/server";
import type { AiControlPlaneConfig, AiProviderEndpoint } from "@/lib/ai-control-plane/types";
import { extractMediaAssetIdFromUrl } from "@/lib/api/kie-reference-image.server";
import {
  PRODUCT_TITLE_DEFAULT_MODEL,
  PRODUCT_TITLE_IMAGE_JPEG_QUALITY,
  PRODUCT_TITLE_IMAGE_MAX_LONG_EDGE,
  PRODUCT_TITLE_MAX_CANDIDATES,
  PRODUCT_TITLE_MAX_IMAGE_BYTES,
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
  /** 模型名注入（测试用）；默认 PRODUCT_TITLE_MODEL 环境变量或 deepseek-flash。 */
  model?: string;
};

const SYSTEM_PROMPT = `你是资深跨境电商运营，长期负责欧美市场（Amazon / Etsy / Shopify）的商品上架。
你的任务：只看一张商品或模特的图片，判断它的品类、主体、材质、颜色、风格与典型使用场景，
写出可直接上架的英文商品标题，并给出中文对照。

必须遵守：
1. 标题为纯英文，长度尽量落在 120~200 个字符之间，词序按欧美买家的搜索习惯排列
   （核心品类词 + 关键属性 + 使用场景/受众）。
2. 只客观描述图片中真实可见的信息，不夸大、不承诺效果。
3. 禁止使用 best、No.1、#1、free、cheapest、guarantee、100% off 等违反平台规范的词。
4. 不编造具体品牌名；确有必要时用 [Brand] 占位。
5. 中文对照是英文标题的准确翻译，不要额外发挥。
6. 只输出 JSON，不要输出解释、标题、列表符号或额外文字。`;

const USER_PROMPT = `请根据这张图片生成 3 条英文商品标题，三条的角度必须各不相同：
第 1 条偏功能与卖点，第 2 条偏使用场景与目标人群，第 3 条偏材质与规格。

只输出下面这个 JSON（不要输出任何其他内容）：
{"titles":[{"en":"英文标题","zh":"中文对照","angle":"这条标题的卖点角度，20 字以内的中文"}]}`;

/** 模型名：PRODUCT_TITLE_MODEL 环境变量优先，其次默认 deepseek-flash。 */
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

/** 生成商品标题。所有失败都抛 ProductTitleError（含中文提示与状态码）。 */
export async function generateProductTitles(
  imageUrl: string,
  dependencies: ProductTitleDependencies = {},
): Promise<{ model: string; titles: ProductTitleCandidate[]; imageBytes: number }> {
  const provider = await resolveDeepseekProvider(dependencies);
  const model = resolveProductTitleModel(dependencies.model);
  const loadImageBytes = dependencies.loadImageBytes ?? loadProductTitleImageBytes;
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  const loaded = await loadImageBytes(imageUrl);
  if (!loaded.bytes?.length) {
    throw new ProductTitleError("图片内容为空，请换一张结果图后重试。", "PRODUCT_TITLE_IMAGE_EMPTY", 400);
  }
  if (loaded.bytes.byteLength > PRODUCT_TITLE_MAX_IMAGE_BYTES) {
    throw new ProductTitleError(
      `图片文件超过 ${formatMegabytes(PRODUCT_TITLE_MAX_IMAGE_BYTES)} 上限，无法用于生成商品标题，请换一张结果图。`,
      "PRODUCT_TITLE_IMAGE_TOO_LARGE",
      413,
    );
  }

  const compressed = await compressProductTitleImage(loaded.bytes);
  if (compressed.byteLength > PRODUCT_TITLE_MAX_IMAGE_BYTES) {
    throw new ProductTitleError(
      `图片压缩后仍超过 ${formatMegabytes(PRODUCT_TITLE_MAX_IMAGE_BYTES)} 上限，无法用于生成商品标题，请换一张结果图。`,
      "PRODUCT_TITLE_IMAGE_TOO_LARGE",
      413,
    );
  }
  const imageDataUrl = `data:image/jpeg;base64,${compressed.toString("base64")}`;

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

  const requestBody = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: USER_PROMPT },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
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
  return { model, titles, imageBytes: compressed.byteLength };
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
    throw new ProductTitleError("图片无法解析或压缩，请换一张结果图后重试。", "PRODUCT_TITLE_IMAGE_INVALID", 400);
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
    throw new ProductTitleError("图片地址无法识别，请换一张结果图后重试。", "PRODUCT_TITLE_IMAGE_URL_INVALID", 400);
  }
  let response: Response;
  try {
    response = await fetch(imageUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(PRODUCT_TITLE_TIMEOUT_MS) });
  } catch {
    throw new ProductTitleError("图片读取失败，请稍后重试。", "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  if (!response.ok) {
    throw new ProductTitleError(`图片读取失败（HTTP ${response.status}），请换一张结果图后重试。`, "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || undefined,
  };
}

async function loadMediaAssetBytes(assetId: string): Promise<ProductTitleImageBytes> {
  const bucketName = process.env.ALIYUN_OSS_BUCKET?.trim();
  if (!bucketName) {
    throw new ProductTitleError("图片存储未配置，无法读取结果图，请联系管理员。", "PRODUCT_TITLE_STORAGE_NOT_CONFIGURED", 503);
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
    throw new ProductTitleError("结果图不可读或尚未完成安全校验，请重新生成后重试。", "PRODUCT_TITLE_ASSET_UNAVAILABLE", 400);
  }

  let signedUrl: string;
  try {
    signedUrl = createAliyunOssRegistryReadUrl(row.object_key, bucketName);
  } catch {
    throw new ProductTitleError("图片存储配置异常，无法读取结果图，请联系管理员。", "PRODUCT_TITLE_STORAGE_NOT_CONFIGURED", 503);
  }
  let response: Response;
  try {
    response = await fetch(signedUrl, { method: "GET", redirect: "error", signal: AbortSignal.timeout(PRODUCT_TITLE_TIMEOUT_MS) });
  } catch {
    throw new ProductTitleError("图片读取失败，请稍后重试。", "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
  }
  if (!response.ok) {
    throw new ProductTitleError(`图片读取失败（HTTP ${response.status}），请重新生成后重试。`, "PRODUCT_TITLE_IMAGE_FETCH_FAILED", 502);
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
