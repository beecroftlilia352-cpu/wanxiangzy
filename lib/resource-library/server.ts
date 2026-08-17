import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeGenerationState } from "@/lib/api/generation-state";
import { isRecord } from "@/lib/utils";
import {
  RESOURCE_LIBRARY_ASSET_SOURCES,
  RESOURCE_LIBRARY_MEDIA_TYPES,
  RESOURCE_LIBRARY_VIEWS,
  createGenerationAssetOriginKey,
  getResourceLibraryModuleLabel,
  type ResourceLibraryAsset,
  type ResourceLibraryAssetListResponse,
  type ResourceLibraryAssetSource,
  type ResourceLibraryAssetStatus,
  type ResourceLibraryFacet,
  type ResourceLibraryGenerationSelection,
  type ResourceLibraryMediaType,
  type ResourceLibraryView,
  type UserPrompt,
  type UserPromptListResponse,
} from "@/lib/resource-library/types";

export const RESOURCE_LIBRARY_ASSET_COLUMNS = [
  "id",
  "url",
  "preview_url",
  "source_type",
  "media_type",
  "module_key",
  "source_generation_id",
  "source_result_index",
  "group_key",
  "group_total",
  "title",
  "original_filename",
  "mime_type",
  "byte_size",
  "width",
  "height",
  "duration_ms",
  "metadata",
  "saved_at",
  "created_at",
  "updated_at",
].join(",");

const USER_PROMPT_COLUMNS = [
  "id",
  "title",
  "content",
  "creation_type",
  "module_key",
  "tags",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const DEFAULT_ASSET_PAGE_SIZE = 24;
const MAX_ASSET_PAGE_SIZE = 60;
const DEFAULT_PROMPT_PAGE_SIZE = 20;
const MAX_PROMPT_PAGE_SIZE = 60;
const MAX_STATUS_ITEMS = 100;
const MAX_RESULT_SELECTIONS = 24;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResourceLibraryAssetRow = {
  id?: unknown;
  url?: unknown;
  preview_url?: unknown;
  source_type?: unknown;
  media_type?: unknown;
  module_key?: unknown;
  source_generation_id?: unknown;
  source_result_index?: unknown;
  group_key?: unknown;
  group_total?: unknown;
  title?: unknown;
  original_filename?: unknown;
  mime_type?: unknown;
  byte_size?: unknown;
  width?: unknown;
  height?: unknown;
  duration_ms?: unknown;
  metadata?: unknown;
  saved_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  origin_key?: unknown;
};

type UserPromptRow = {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  creation_type?: unknown;
  module_key?: unknown;
  tags?: unknown;
  metadata?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type ResourceLibraryAssetListQuery = {
  source: ResourceLibraryAssetSource | null;
  moduleKey: string | null;
  mediaType: ResourceLibraryMediaType | null;
  view: ResourceLibraryView | null;
  cursor: string | null;
  limit: number;
};

export type UserPromptListQuery = {
  creationType: string | null;
  moduleKey: string | null;
  q: string;
  cursor: string | null;
  limit: number;
};

export type NormalizedUserPromptPayload = {
  title?: string;
  content?: string;
  creation_type?: string;
  module_key?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export class ResourceLibraryError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "RESOURCE_LIBRARY_ERROR") {
    super(message);
    this.name = "ResourceLibraryError";
    this.status = status;
    this.code = code;
  }
}

export function parseResourceLibraryAssetListQuery(searchParams: URLSearchParams): ResourceLibraryAssetListQuery {
  const sourceValue = searchParams.get("source");
  const mediaValue = searchParams.get("media");
  const viewValue = searchParams.get("view");
  return {
    source: isOneOf(sourceValue, RESOURCE_LIBRARY_ASSET_SOURCES) ? sourceValue : null,
    moduleKey: normalizeIdentifier(searchParams.get("module")),
    mediaType: isOneOf(mediaValue, RESOURCE_LIBRARY_MEDIA_TYPES) ? mediaValue : null,
    view: isOneOf(viewValue, RESOURCE_LIBRARY_VIEWS) ? viewValue : null,
    cursor: normalizeCursor(searchParams.get("cursor")),
    limit: clampPageSize(searchParams.get("limit"), DEFAULT_ASSET_PAGE_SIZE, MAX_ASSET_PAGE_SIZE),
  };
}

export function parseUserPromptListQuery(searchParams: URLSearchParams): UserPromptListQuery {
  return {
    creationType: normalizeIdentifier(searchParams.get("creationType")),
    moduleKey: normalizeIdentifier(searchParams.get("module")),
    q: normalizeSearchQuery(searchParams.get("q")),
    cursor: normalizeCursor(searchParams.get("cursor")),
    limit: clampPageSize(searchParams.get("limit"), DEFAULT_PROMPT_PAGE_SIZE, MAX_PROMPT_PAGE_SIZE),
  };
}

export function normalizeGenerationAssetRequest(value: unknown) {
  if (!isRecord(value)) {
    throw new ResourceLibraryError("收藏参数格式无效", 400, "INVALID_PAYLOAD");
  }
  const generationId = typeof value.generationId === "string" ? value.generationId.trim() : "";
  if (!UUID_PATTERN.test(generationId)) {
    throw new ResourceLibraryError("生成记录 ID 无效", 400, "INVALID_GENERATION_ID");
  }

  const values = Array.isArray(value.resultIndexes)
    ? value.resultIndexes
    : value.resultIndex === undefined
      ? []
      : [value.resultIndex];
  const resultIndexes = Array.from(new Set(values.map(Number)))
    .filter((index) => Number.isSafeInteger(index) && index >= 0)
    .sort((left, right) => left - right);
  if (!resultIndexes.length || resultIndexes.length > MAX_RESULT_SELECTIONS) {
    throw new ResourceLibraryError(`请选择 1-${MAX_RESULT_SELECTIONS} 个有效结果`, 400, "INVALID_RESULT_INDEX");
  }
  if (resultIndexes.length !== values.length) {
    throw new ResourceLibraryError("结果序号无效或重复", 400, "INVALID_RESULT_INDEX");
  }
  return { generationId, resultIndexes };
}

export function normalizeAssetStatusRequest(value: unknown): ResourceLibraryGenerationSelection[] {
  if (!isRecord(value) || !Array.isArray(value.items) || !value.items.length || value.items.length > MAX_STATUS_ITEMS) {
    throw new ResourceLibraryError(`状态查询必须包含 1-${MAX_STATUS_ITEMS} 项`, 400, "INVALID_STATUS_ITEMS");
  }

  return value.items.map((item) => {
    if (!isRecord(item)) {
      throw new ResourceLibraryError("状态查询项格式无效", 400, "INVALID_STATUS_ITEM");
    }
    const generationId = typeof item.generationId === "string" ? item.generationId.trim() : "";
    const resultIndex = Number(item.resultIndex);
    if (!UUID_PATTERN.test(generationId) || !Number.isSafeInteger(resultIndex) || resultIndex < 0) {
      throw new ResourceLibraryError("状态查询项格式无效", 400, "INVALID_STATUS_ITEM");
    }
    return { generationId, resultIndex };
  });
}

export function normalizeUserPromptPayload(value: unknown, options: { partial?: boolean } = {}): NormalizedUserPromptPayload {
  if (!isRecord(value)) {
    throw new ResourceLibraryError("提示词参数格式无效", 400, "INVALID_PROMPT_PAYLOAD");
  }

  const payload: NormalizedUserPromptPayload = {};
  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "title")) {
    const title = typeof value.title === "string" ? value.title.trim() : "";
    if (!title || title.length > 20) {
      throw new ResourceLibraryError("提示词标题需为 1-20 个字符", 400, "INVALID_PROMPT_TITLE");
    }
    payload.title = title;
  }
  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "content")) {
    const content = typeof value.content === "string" ? value.content.trim() : "";
    if (!content || content.length > 2000) {
      throw new ResourceLibraryError("提示词内容需为 1-2000 个字符", 400, "INVALID_PROMPT_CONTENT");
    }
    payload.content = content;
  }
  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "creationType")) {
    const creationType = normalizeIdentifier(value.creationType);
    if (!creationType) {
      throw new ResourceLibraryError("创作类型无效", 400, "INVALID_CREATION_TYPE");
    }
    payload.creation_type = creationType;
  }
  if (Object.prototype.hasOwnProperty.call(value, "moduleKey")) {
    const rawModuleKey = value.moduleKey;
    if (rawModuleKey !== null && rawModuleKey !== "" && !normalizeIdentifier(rawModuleKey)) {
      throw new ResourceLibraryError("功能模块无效", 400, "INVALID_MODULE_KEY");
    }
    payload.module_key = normalizeIdentifier(rawModuleKey);
  }
  if (Object.prototype.hasOwnProperty.call(value, "tags")) {
    if (!Array.isArray(value.tags)) {
      throw new ResourceLibraryError("提示词标签格式无效", 400, "INVALID_PROMPT_TAGS");
    }
    const tags = Array.from(new Set(value.tags
      .filter((tag): tag is string => typeof tag === "string")
      .map((tag) => tag.trim())
      .filter(Boolean)));
    if (tags.length > 10 || tags.some((tag) => tag.length > 24)) {
      throw new ResourceLibraryError("最多添加 10 个标签，每个不超过 24 个字符", 400, "INVALID_PROMPT_TAGS");
    }
    payload.tags = tags;
  }
  if (Object.prototype.hasOwnProperty.call(value, "metadata")) {
    if (!isRecord(value.metadata) || JSON.stringify(value.metadata).length > 10_000) {
      throw new ResourceLibraryError("提示词附加信息无效", 400, "INVALID_PROMPT_METADATA");
    }
    payload.metadata = value.metadata;
  }
  if (options.partial && !Object.keys(payload).length) {
    throw new ResourceLibraryError("没有可更新的提示词字段", 400, "EMPTY_PROMPT_UPDATE");
  }
  return payload;
}

export async function listResourceLibraryAssets(
  supabase: SupabaseClient,
  userId: string,
  query: ResourceLibraryAssetListQuery,
): Promise<ResourceLibraryAssetListResponse> {
  let request = supabase
    .from("resource_library_assets")
    .select(RESOURCE_LIBRARY_ASSET_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .eq("moderation_status", "allowed")
    .in("storage_state", ["active", "migration_pending"])
    .order("saved_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);

  if (query.source) request = request.eq("source_type", query.source);
  if (query.moduleKey) request = request.eq("module_key", query.moduleKey);
  if (query.mediaType) request = request.eq("media_type", query.mediaType);
  if (query.view === "single") request = request.eq("media_type", "image").is("group_key", null);
  if (query.view === "group") request = request.eq("media_type", "image").not("group_key", "is", null);
  if (query.view === "video") request = request.eq("media_type", "video");
  request = applyCursor(request, query.cursor, "saved_at");

  const { data, error } = await request;
  if (error) throw databaseError(error.message);
  const fetched = (Array.isArray(data) ? data : []) as ResourceLibraryAssetRow[];
  const visible = fetched.slice(0, query.limit).map(resourceLibraryAssetRowToClient);
  return {
    items: visible,
    hasMore: fetched.length > query.limit,
    nextCursor: fetched.length > query.limit && visible.length
      ? encodeCursor(visible[visible.length - 1].savedAt, visible[visible.length - 1].id)
      : null,
  };
}

export async function saveGenerationAssets(
  supabase: SupabaseClient,
  userId: string,
  value: unknown,
): Promise<ResourceLibraryAsset[]> {
  const { generationId, resultIndexes } = normalizeGenerationAssetRequest(value);
  const { data: generation, error } = await supabase
    .from("generations")
    .select("id,user_id,status,result_urls,job_payload,created_at,completed_at")
    .eq("id", generationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw databaseError(error.message);
  if (!generation) {
    throw new ResourceLibraryError("生成记录不存在", 404, "GENERATION_NOT_FOUND");
  }

  const resultUrls = stringArray(generation.result_urls);
  const state = normalizeGenerationState({
    status: stringValue(generation.status),
    resultUrls,
    payload: generation.job_payload,
    completedAt: nullableString(generation.completed_at),
  });
  if (state.status !== "completed" || !resultUrls.length) {
    throw new ResourceLibraryError("生成任务尚未完成，暂时无法收藏", 409, "GENERATION_NOT_COMPLETED");
  }

  const payload = isRecord(generation.job_payload) ? generation.job_payload : {};
  const moderation = isRecord(payload.adminModeration) ? payload.adminModeration : {};
  if (moderation.action === "hide") {
    throw new ResourceLibraryError("该结果已下架，无法加入资源仓库", 409, "GENERATION_HIDDEN");
  }
  if (resultIndexes.some((index) => index >= resultUrls.length)) {
    throw new ResourceLibraryError("生成结果序号超出范围", 400, "RESULT_INDEX_OUT_OF_RANGE");
  }

  const moduleKey = normalizeIdentifier(payload.kind) || "unknown";
  const groupKey = resultUrls.length > 1 ? generationId : null;
  const now = new Date().toISOString();
  const rows = resultIndexes.map((resultIndex) => {
    const url = resultUrls[resultIndex];
    const mediaType = inferMediaType(moduleKey, url);
    return {
      user_id: userId,
      source_type: "generation",
      media_type: mediaType,
      module_key: moduleKey,
      url,
      preview_url: null,
      storage_provider: inferStorageProvider(url),
      source_generation_id: generationId,
      source_result_index: resultIndex,
      origin_key: createGenerationAssetOriginKey(generationId, resultIndex),
      group_key: groupKey,
      group_total: resultUrls.length,
      title: buildGeneratedAssetTitle(moduleKey, resultIndex, resultUrls.length),
      metadata: {
        generationCreatedAt: nullableString(generation.created_at),
        generationCompletedAt: nullableString(generation.completed_at),
      },
      storage_state: "active",
      moderation_status: "allowed",
      saved_at: now,
      deleted_at: null,
    };
  });

  const { data, error: upsertError } = await supabase
    .from("resource_library_assets")
    .upsert(rows, { onConflict: "user_id,origin_key" })
    .select(RESOURCE_LIBRARY_ASSET_COLUMNS);
  if (upsertError) throw databaseError(upsertError.message);
  return ((Array.isArray(data) ? data : []) as ResourceLibraryAssetRow[])
    .map(resourceLibraryAssetRowToClient)
    .sort((left, right) => (left.sourceResultIndex || 0) - (right.sourceResultIndex || 0));
}

export async function getResourceLibraryAssetStatuses(
  supabase: SupabaseClient,
  userId: string,
  value: unknown,
): Promise<ResourceLibraryAssetStatus[]> {
  const selections = normalizeAssetStatusRequest(value);
  const originKeys = Array.from(new Set(selections.map((item) =>
    createGenerationAssetOriginKey(item.generationId, item.resultIndex))));
  const { data, error } = await supabase
    .from("resource_library_assets")
    .select("id,origin_key")
    .eq("user_id", userId)
    .eq("source_type", "generation")
    .is("deleted_at", null)
    .eq("moderation_status", "allowed")
    .in("origin_key", originKeys);
  if (error) throw databaseError(error.message);

  const ids = new Map<string, string>();
  for (const row of Array.isArray(data) ? data : []) {
    const originKey = stringValue(row.origin_key);
    const id = stringValue(row.id);
    if (originKey && id) ids.set(originKey, id);
  }
  return selections.map((selection) => {
    const assetId = ids.get(createGenerationAssetOriginKey(selection.generationId, selection.resultIndex)) || null;
    return { ...selection, assetId, saved: Boolean(assetId) };
  });
}

export async function softDeleteResourceLibraryAsset(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  if (!UUID_PATTERN.test(id)) {
    throw new ResourceLibraryError("资源 ID 无效", 400, "INVALID_ASSET_ID");
  }
  const { error } = await supabase
    .from("resource_library_assets")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw databaseError(error.message);
}

export async function listResourceLibraryFacets(
  supabase: SupabaseClient,
): Promise<ResourceLibraryFacet[]> {
  const { data, error } = await supabase.rpc("get_resource_library_facets");
  if (error) throw databaseError(error.message);
  return (Array.isArray(data) ? data : []).map((row) => ({
    sourceType: normalizeAssetSource(row.source_type),
    moduleKey: normalizeIdentifier(row.module_key),
    mediaType: normalizeMediaType(row.media_type),
    view: normalizeView(row.view_kind),
    total: Math.max(0, numberValue(row.total)),
  }));
}

export async function listUserPrompts(
  supabase: SupabaseClient,
  userId: string,
  query: UserPromptListQuery,
): Promise<UserPromptListResponse> {
  let request = supabase
    .from("user_prompts")
    .select(USER_PROMPT_COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);
  if (query.creationType) request = request.eq("creation_type", query.creationType);
  if (query.moduleKey) request = request.eq("module_key", query.moduleKey);
  if (query.q) {
    const pattern = `%${sanitizePostgrestSearch(query.q)}%`;
    request = request.or(`title.ilike.${pattern},content.ilike.${pattern}`);
  }
  request = applyCursor(request, query.cursor, "updated_at");

  const { data, error } = await request;
  if (error) throw databaseError(error.message);
  const fetched = (Array.isArray(data) ? data : []) as UserPromptRow[];
  const visible = fetched.slice(0, query.limit).map(userPromptRowToClient);
  return {
    items: visible,
    hasMore: fetched.length > query.limit,
    nextCursor: fetched.length > query.limit && visible.length
      ? encodeCursor(visible[visible.length - 1].updatedAt, visible[visible.length - 1].id)
      : null,
  };
}

export async function createUserPrompt(
  supabase: SupabaseClient,
  userId: string,
  value: unknown,
) {
  const payload = normalizeUserPromptPayload(value);
  const { data, error } = await supabase
    .from("user_prompts")
    .insert({ user_id: userId, tags: [], metadata: {}, ...payload })
    .select(USER_PROMPT_COLUMNS)
    .single();
  if (error) throw databaseError(error.message);
  return userPromptRowToClient(data as UserPromptRow);
}

export async function updateUserPrompt(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  value: unknown,
) {
  if (!UUID_PATTERN.test(id)) {
    throw new ResourceLibraryError("提示词 ID 无效", 400, "INVALID_PROMPT_ID");
  }
  const payload = normalizeUserPromptPayload(value, { partial: true });
  const { data, error } = await supabase
    .from("user_prompts")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select(USER_PROMPT_COLUMNS)
    .maybeSingle();
  if (error) throw databaseError(error.message);
  if (!data) throw new ResourceLibraryError("提示词不存在", 404, "PROMPT_NOT_FOUND");
  return userPromptRowToClient(data as UserPromptRow);
}

export async function softDeleteUserPrompt(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  if (!UUID_PATTERN.test(id)) {
    throw new ResourceLibraryError("提示词 ID 无效", 400, "INVALID_PROMPT_ID");
  }
  const { error } = await supabase
    .from("user_prompts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw databaseError(error.message);
}

export function resourceLibraryAssetRowToClient(row: ResourceLibraryAssetRow): ResourceLibraryAsset {
  return {
    id: stringValue(row.id),
    url: stringValue(row.url),
    previewUrl: nullableString(row.preview_url),
    thumbnailUrl: nullableString(row.preview_url),
    sourceType: normalizeAssetSource(row.source_type),
    mediaType: normalizeMediaType(row.media_type),
    moduleKey: normalizeIdentifier(row.module_key),
    sourceGenerationId: nullableString(row.source_generation_id),
    sourceResultIndex: nullableInteger(row.source_result_index),
    groupKey: nullableString(row.group_key),
    groupTotal: Math.max(1, numberValue(row.group_total) || 1),
    title: stringValue(row.title) || "未命名资源",
    originalFilename: nullableString(row.original_filename),
    mimeType: nullableString(row.mime_type),
    byteSize: nullableInteger(row.byte_size),
    width: nullableInteger(row.width),
    height: nullableInteger(row.height),
    durationMs: nullableInteger(row.duration_ms),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    savedAt: dateString(row.saved_at),
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
  };
}

export function userPromptRowToClient(row: UserPromptRow): UserPrompt {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    content: stringValue(row.content),
    creationType: stringValue(row.creation_type),
    moduleKey: normalizeIdentifier(row.module_key),
    tags: stringArray(row.tags),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
  };
}

function applyCursor<T extends { or: (filters: string) => T }>(request: T, cursor: string | null, field: string) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return request;
  return request.or(`${field}.lt.${decoded.at},and(${field}.eq.${decoded.at},id.lt.${decoded.id})`);
}

function encodeCursor(at: string, id: string) {
  return Buffer.from(JSON.stringify({ at, id }), "utf8").toString("base64url");
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(parsed) || typeof parsed.at !== "string" || typeof parsed.id !== "string") return null;
    if (!Number.isFinite(Date.parse(parsed.at)) || !UUID_PATTERN.test(parsed.id)) return null;
    return { at: new Date(parsed.at).toISOString(), id: parsed.id };
  } catch {
    return null;
  }
}

function normalizeCursor(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length <= 512 && decodeCursor(normalized) ? normalized : null;
}

function normalizeIdentifier(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return IDENTIFIER_PATTERN.test(normalized) ? normalized : null;
}

function normalizeSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function sanitizePostgrestSearch(value: string) {
  return value.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim();
}

function clampPageSize(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), max) : fallback;
}

function inferMediaType(moduleKey: string, url: string): ResourceLibraryMediaType {
  if (moduleKey.startsWith("video")) return "video";
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (/\.(mp4|mov|m4v|webm)$/.test(pathname)) return "video";
  } catch {
    // The generation URL has already been validated by the generation pipeline.
  }
  return "image";
}

function inferStorageProvider(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.endsWith(".aliyuncs.com") || host.includes(".oss-")) return "aliyun-oss";
    if (host === "i.ibb.co" || host.endsWith(".ibb.co")) return "imgbb";
    return "external";
  } catch {
    return "unknown";
  }
}

function buildGeneratedAssetTitle(moduleKey: string, resultIndex: number, total: number) {
  const label = getResourceLibraryModuleLabel(moduleKey);
  return total > 1 ? `${label} ${resultIndex + 1}` : label;
}

function normalizeAssetSource(value: unknown): ResourceLibraryAssetSource {
  return value === "generation" ? "generation" : "upload";
}

function normalizeMediaType(value: unknown): ResourceLibraryMediaType {
  return value === "video" ? "video" : "image";
}

function normalizeView(value: unknown): ResourceLibraryView {
  if (value === "group" || value === "video") return value;
  return "single";
}

function databaseError(message: string) {
  return new ResourceLibraryError(message || "资源仓库服务异常", 500, "DATABASE_ERROR");
}

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const normalized = stringValue(value);
  return normalized || null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function dateString(value: unknown) {
  const parsed = typeof value === "string" ? value : "";
  return Number.isFinite(Date.parse(parsed)) ? parsed : new Date(0).toISOString();
}
