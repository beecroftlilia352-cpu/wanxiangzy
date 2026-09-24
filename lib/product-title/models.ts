/**
 * 「商品标题」模型清单（新增模块，属于本功能自身的脚手架）。
 *
 * 为什么要单独维护这份能力表：控制面里的 "deepseek" 供应商刻意没有 deployments/models，
 * 直接问上游最准 —— 实测 GET https://api.deepseek.com/models 只返回 2 个模型：
 *   · deepseek-flash   (DeepSeek-V4.1-Flash) input_modalities = ["text","image"] → 支持图片
 *   · deepseek-v4-pro  (DeepSeek-V4-Pro)     input_modalities = ["text"]        → 不支持图片
 * 不支持图片的模型收到 image content part 会被上游拒绝，所以 GET /api/product-title/models 与
 * POST /api/product-title **必须共用同一份能力表**（同一份缓存）。
 *
 * 缓存：5 分钟进程内内存缓存（成功与失败都缓存，避免供应商故障时每次打开弹窗都等超时）；
 * 上游失败时回退到内置清单（types.ts 的 PRODUCT_TITLE_FALLBACK_MODELS），并标 fallback: true。
 *
 * 安全：apiKey 只在服务端内存里拼 Authorization 头，不返回前端、不写日志。
 */

import { buildAiAdapterAuthHeaders } from "@/lib/ai-control-plane/adapters";
import {
  PRODUCT_TITLE_FALLBACK_MODELS,
  PRODUCT_TITLE_MODELS_CACHE_TTL_MS,
  PRODUCT_TITLE_MODELS_PATH,
  PRODUCT_TITLE_MODELS_TIMEOUT_MS,
  type ProductTitleModelInfo,
} from "./types";

export type ProductTitleModelCatalog = {
  models: ProductTitleModelInfo[];
  /** true = 内置兜底清单（上游不可用 / 未配置）。 */
  fallback: boolean;
};

export type ProductTitleModelsDependencies = {
  /** 供应商 baseUrl（由 resolveDeepseekProvider 提供）。 */
  baseUrl: string;
  /** 解密后的 apiKey；只在内存里用。 */
  apiKey: string;
  /** 上游超时注入（测试用）。 */
  timeoutMs?: number;
  /** fetch 注入（测试用）；默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 跳过缓存直接请求（测试用）。 */
  skipCache?: boolean;
};

let catalogCache: { expiresAt: number; catalog: ProductTitleModelCatalog } | null = null;

/** 清空模型清单缓存（测试用；也供将来管理端手动刷新）。 */
export function invalidateProductTitleModelsCache(): void {
  catalogCache = null;
}

function cloneModels(models: readonly ProductTitleModelInfo[]): ProductTitleModelInfo[] {
  return models.map((model) => ({ ...model, effortLevels: [...model.effortLevels] }));
}

/** 内置兜底清单（每次返回新对象，调用方改不到共享常量）。 */
export function fallbackProductTitleCatalog(): ProductTitleModelCatalog {
  return { models: cloneModels(PRODUCT_TITLE_FALLBACK_MODELS), fallback: true };
}

/**
 * 归一化上游 /models 响应。
 * 容忍 `data` / `models` 两种包裹；字段缺失时用内置清单或安全默认值兜底，绝不抛错。
 */
export function parseUpstreamProductTitleModels(payload: unknown): ProductTitleModelInfo[] {
  const list = pickModelList(payload);
  const models: ProductTitleModelInfo[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (!id) continue;

    const known = PRODUCT_TITLE_FALLBACK_MODELS.find((model) => model.id === id);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : known?.name ?? id;
    const modalities = Array.isArray(record.input_modalities)
      ? record.input_modalities.filter((value): value is string => typeof value === "string")
      : [];
    const vision = modalities.length
      ? modalities.some((value) => value.toLowerCase() === "image")
      // 上游没给模态信息时，只对内置已知模型沿用已知能力，其余按不支持图片处理（保守）。
      : known?.vision === true;

    const effort = record.effort && typeof record.effort === "object"
      ? (record.effort as { supported_levels?: unknown }).supported_levels
      : undefined;

    models.push({
      id,
      name,
      vision,
      contextWindow: readPositiveInt(record.context_window ?? record.context_length, known?.contextWindow ?? 0),
      maxOutputTokens: readPositiveInt(record.max_output_tokens ?? record.max_tokens, known?.maxOutputTokens ?? 0),
      effortLevels: Array.isArray(effort)
        ? effort.filter((value): value is string => typeof value === "string")
        : [...(known?.effortLevels ?? [])],
    });
  }
  return models;
}

/**
 * 同步读取「当前已知的」模型清单（不发网络请求）：
 * 命中 5 分钟缓存 → 用缓存；否则 → 内置兜底清单。
 * 供 POST 校验（模型白名单 + 是否支持图片）与前端回退使用。
 */
export function getProductTitleModelCatalog(): ProductTitleModelCatalog {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.catalog;
  return fallbackProductTitleCatalog();
}

/** 当前允许的模型 id（白名单）。 */
export function getKnownProductTitleModelIds(): string[] {
  return getProductTitleModelCatalog().models.map((model) => model.id);
}

/** 当前模型是否支持图片输入（未知模型一律按不支持处理）。 */
export function isProductTitleVisionModel(modelId: string): boolean {
  const catalog = getProductTitleModelCatalog();
  return catalog.models.find((model) => model.id === modelId)?.vision === true;
}

/** 支持图片的默认模型 id（下拉框默认值）。 */
export function resolveDefaultProductTitleModelId(models: readonly ProductTitleModelInfo[]): string {
  return models.find((model) => model.vision)?.id ?? models[0]?.id ?? "";
}

/**
 * 请求上游 /models 并（在成功或失败时都）写入 5 分钟缓存。
 * 绝不抛错：任何异常都退化为内置清单 + fallback: true。
 */
export async function fetchProductTitleModelCatalog(
  dependencies: ProductTitleModelsDependencies,
): Promise<ProductTitleModelCatalog> {
  if (!dependencies.skipCache && catalogCache && catalogCache.expiresAt > Date.now()) {
    return catalogCache.catalog;
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const url = `${dependencies.baseUrl.replace(/\/+$/, "")}${PRODUCT_TITLE_MODELS_PATH}`;
  const timeoutMs = Math.min(dependencies.timeoutMs || PRODUCT_TITLE_MODELS_TIMEOUT_MS, PRODUCT_TITLE_MODELS_TIMEOUT_MS);

  let catalog: ProductTitleModelCatalog;
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        ...buildAiAdapterAuthHeaders({ protocol: "openai-chat", apiKey: dependencies.apiKey }),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`upstream models HTTP ${response.status}`);
    const models = parseUpstreamProductTitleModels(await response.json());
    if (!models.length) throw new Error("upstream models list is empty");
    catalog = { models, fallback: false };
  } catch {
    // 供应商不可用 / 超时 / 响应结构变化：退化为内置清单，前端不阻塞。
    catalog = fallbackProductTitleCatalog();
  }

  catalogCache = { expiresAt: Date.now() + PRODUCT_TITLE_MODELS_CACHE_TTL_MS, catalog };
  return catalog;
}

function pickModelList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as { data?: unknown; models?: unknown };
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.models)) return record.models;
  }
  return [];
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}
