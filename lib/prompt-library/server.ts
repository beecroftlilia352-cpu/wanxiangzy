import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecord } from "@/lib/utils";
import {
  PROMPT_LIBRARY_CONTENT_MAX_LENGTH,
  PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
  PROMPT_LIBRARY_SCOPES,
  PROMPT_LIBRARY_TITLE_MAX_LENGTH,
  type PromptLibraryAdminListResponse,
  type PromptLibraryItem,
  type PromptLibraryListResponse,
  type PromptLibraryScope,
} from "@/lib/prompt-library/types";

/**
 * 共享提示词词库服务端模块（表：public.prompt_library_items）。
 *
 * 这是独立于 lib/resource-library/server.ts 的新模块：词库与「我的提示词」是两套不同的
 * 可见性模型（共享 vs 私有），因此不共用函数，避免改动既有功能。
 *
 * 这里的小工具函数（cursor、分页钳制、PostgREST 关键词清洗等）是从既有模块按同样语义
 * 独立实现的副本，刻意不跨模块 import 私有实现，保持模块自治。
 */

export const PROMPT_LIBRARY_TABLE = "prompt_library_items";

export const PROMPT_LIBRARY_COLUMNS = [
  "id",
  "title",
  "content",
  "creation_type",
  "module_key",
  "metadata",
  "created_by",
  "created_by_email",
  "created_at",
  "updated_at",
].join(",");

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 60;
const DEFAULT_ADMIN_PAGE_SIZE = 20;
const MAX_ADMIN_PAGE_SIZE = 100;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PromptLibraryRow = {
  id?: unknown;
  title?: unknown;
  content?: unknown;
  creation_type?: unknown;
  module_key?: unknown;
  metadata?: unknown;
  created_by?: unknown;
  created_by_email?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

export type PromptLibraryListQuery = {
  /** "all" = 共享词库（所有已登录用户可读）；"mine" = 仅当前用户保存的。 */
  scope: PromptLibraryScope;
  creationType: string | null;
  moduleKey: string | null;
  q: string;
  cursor: string | null;
  limit: number;
};

export type PromptLibraryAdminListQuery = {
  q: string;
  page: number;
  pageSize: number;
  /** 后台默认只看未删除条目；审计排查时可显式要求包含已删除。 */
  includeDeleted: boolean;
};

export type NormalizedPromptLibraryPayload = {
  title?: string;
  content?: string;
  creation_type?: string;
  module_key?: string | null;
  metadata?: Record<string, unknown>;
};

export type PromptLibraryOwner = {
  userId: string;
  email?: string | null;
};

export class PromptLibraryError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "PROMPT_LIBRARY_ERROR") {
    super(message);
    this.name = "PromptLibraryError";
    this.status = status;
    this.code = code;
  }
}

export function parsePromptLibraryListQuery(searchParams: URLSearchParams): PromptLibraryListQuery {
  const scopeValue = searchParams.get("scope");
  return {
    scope: isOneOf(scopeValue, PROMPT_LIBRARY_SCOPES) ? scopeValue : "all",
    creationType: normalizeIdentifier(searchParams.get("creationType")),
    moduleKey: normalizeIdentifier(searchParams.get("module")),
    q: normalizeSearchQuery(searchParams.get("q")),
    cursor: normalizeCursor(searchParams.get("cursor")),
    limit: clampPageSize(searchParams.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

export function parsePromptLibraryAdminListQuery(searchParams: URLSearchParams): PromptLibraryAdminListQuery {
  return {
    q: normalizeSearchQuery(searchParams.get("q")),
    page: clampPageNumber(searchParams.get("page")),
    pageSize: clampPageSize(searchParams.get("pageSize"), DEFAULT_ADMIN_PAGE_SIZE, MAX_ADMIN_PAGE_SIZE),
    includeDeleted: searchParams.get("includeDeleted") === "true",
  };
}

export function normalizePromptLibraryPayload(
  value: unknown,
  options: { partial?: boolean } = {},
): NormalizedPromptLibraryPayload {
  if (!isRecord(value)) {
    throw new PromptLibraryError("提示词参数格式无效", 400, "INVALID_PROMPT_PAYLOAD");
  }

  const payload: NormalizedPromptLibraryPayload = {};

  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "title")) {
    const title = typeof value.title === "string" ? value.title.trim() : "";
    if (!title || title.length > PROMPT_LIBRARY_TITLE_MAX_LENGTH) {
      throw new PromptLibraryError(
        `提示词标题需为 1-${PROMPT_LIBRARY_TITLE_MAX_LENGTH} 个字符（当前 ${title.length} 个字）`,
        400,
        "INVALID_PROMPT_TITLE",
      );
    }
    payload.title = title;
  }

  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "content")) {
    const content = typeof value.content === "string" ? value.content.trim() : "";
    if (!content || content.length > PROMPT_LIBRARY_CONTENT_MAX_LENGTH) {
      throw new PromptLibraryError(
        `提示词内容需为 1-${PROMPT_LIBRARY_CONTENT_MAX_LENGTH} 个字符（当前 ${content.length} 个字）`,
        400,
        "INVALID_PROMPT_CONTENT",
      );
    }
    payload.content = content;
  }

  if (!options.partial || Object.prototype.hasOwnProperty.call(value, "creationType")) {
    const rawCreationType = value.creationType;
    if (rawCreationType === undefined || rawCreationType === null || rawCreationType === "") {
      // 新建时缺省落库为固定合法值；局部更新时不空写该列。
      if (!options.partial) payload.creation_type = PROMPT_LIBRARY_DEFAULT_CREATION_TYPE;
    } else {
      const creationType = normalizeIdentifier(rawCreationType);
      if (!creationType) {
        throw new PromptLibraryError("创作类型无效", 400, "INVALID_CREATION_TYPE");
      }
      payload.creation_type = creationType;
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "moduleKey")) {
    const rawModuleKey = value.moduleKey;
    if (rawModuleKey !== null && rawModuleKey !== "" && !normalizeIdentifier(rawModuleKey)) {
      throw new PromptLibraryError("功能模块无效", 400, "INVALID_MODULE_KEY");
    }
    payload.module_key = normalizeIdentifier(rawModuleKey);
  }

  if (Object.prototype.hasOwnProperty.call(value, "metadata")) {
    if (!isRecord(value.metadata) || JSON.stringify(value.metadata).length > 10_000) {
      throw new PromptLibraryError("提示词附加信息无效", 400, "INVALID_PROMPT_METADATA");
    }
    payload.metadata = value.metadata;
  }

  if (options.partial && !Object.keys(payload).length) {
    throw new PromptLibraryError("没有可更新的提示词字段", 400, "EMPTY_PROMPT_UPDATE");
  }

  return payload;
}

/**
 * 共享词库列表。
 * scope="all"（默认）：返回所有未删除条目，含创建者标识，供前台词库弹窗 / 后台使用。
 * scope="mine"：仅返回当前用户创建的条目。
 */
export async function listPromptLibraryItems(
  supabase: SupabaseClient,
  query: PromptLibraryListQuery,
  options: { viewerId?: string | null } = {},
): Promise<PromptLibraryListResponse> {
  const viewerId = options.viewerId || null;
  if (query.scope === "mine" && !viewerId) {
    throw new PromptLibraryError("请先登录", 401, "UNAUTHENTICATED");
  }

  let request = supabase
    .from(PROMPT_LIBRARY_TABLE)
    .select(PROMPT_LIBRARY_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);

  if (query.scope === "mine") request = request.eq("created_by", viewerId as string);
  if (query.creationType) request = request.eq("creation_type", query.creationType);
  if (query.moduleKey) request = request.eq("module_key", query.moduleKey);
  if (query.q) {
    const pattern = `%${sanitizePostgrestSearch(query.q)}%`;
    request = request.or(`title.ilike.${pattern},content.ilike.${pattern}`);
  }
  request = applyCursor(request, query.cursor);

  const { data, error } = await request;
  if (error) throw databaseError(error.message);
  const fetched = (Array.isArray(data) ? data : []) as PromptLibraryRow[];
  const visible = fetched.slice(0, query.limit).map(promptLibraryRowToClient);
  return {
    items: visible,
    hasMore: fetched.length > query.limit,
    nextCursor: fetched.length > query.limit && visible.length
      ? encodeCursor(visible[visible.length - 1].createdAt, visible[visible.length - 1].id)
      : null,
  };
}

export async function createPromptLibraryItem(
  supabase: SupabaseClient,
  owner: PromptLibraryOwner,
  value: unknown,
): Promise<PromptLibraryItem> {
  if (!UUID_PATTERN.test(owner.userId)) {
    throw new PromptLibraryError("用户标识无效", 401, "UNAUTHENTICATED");
  }
  const payload = normalizePromptLibraryPayload(value);
  const { data, error } = await supabase
    .from(PROMPT_LIBRARY_TABLE)
    .insert({
      created_by: owner.userId,
      created_by_email: normalizeEmail(owner.email),
      metadata: {},
      ...payload,
    })
    .select(PROMPT_LIBRARY_COLUMNS)
    .single();
  if (error) throw databaseError(error.message);
  return promptLibraryRowToClient(data as PromptLibraryRow);
}

/**
 * 更新条目。传入 options.ownerId 时限定只能改自己的条目（前台路径）；
 * 后台走 service role 时不传 ownerId（不做 created_by 过滤），由接口层校验权限 + 审计。
 */
export async function updatePromptLibraryItem(
  supabase: SupabaseClient,
  id: string,
  value: unknown,
  options: { ownerId?: string | null } = {},
): Promise<PromptLibraryItem> {
  assertUuid(id);
  const payload = normalizePromptLibraryPayload(value, { partial: true });

  let request = supabase
    .from(PROMPT_LIBRARY_TABLE)
    .update(payload)
    .eq("id", id)
    .is("deleted_at", null);
  if (options.ownerId) request = request.eq("created_by", options.ownerId);

  const { data, error } = await request.select(PROMPT_LIBRARY_COLUMNS).maybeSingle();
  if (error) throw databaseError(error.message);
  if (!data) throw new PromptLibraryError("提示词不存在", 404, "PROMPT_NOT_FOUND");
  return promptLibraryRowToClient(data as PromptLibraryRow);
}

/**
 * 软删除（写 deleted_at）。同样是 owner 限定的写法：前台必须传 ownerId，
 * 非本人会命中 404（不泄露他人条目的存在性）。
 */
export async function softDeletePromptLibraryItem(
  supabase: SupabaseClient,
  id: string,
  options: { ownerId?: string | null } = {},
): Promise<{ id: string }> {
  assertUuid(id);

  let request = supabase
    .from(PROMPT_LIBRARY_TABLE)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);
  if (options.ownerId) request = request.eq("created_by", options.ownerId);

  const { data, error } = await request.select("id").maybeSingle();
  if (error) throw databaseError(error.message);
  if (!data) throw new PromptLibraryError("提示词不存在", 404, "PROMPT_NOT_FOUND");
  return { id };
}

/* ------------------------------------------------------------------ *
 * 后台（service role / admin client）专用函数
 * 调用方必须已通过 requireAdminApi 校验权限；这些函数本身不做角色判断。
 * ------------------------------------------------------------------ */

export async function listPromptLibraryItemsForAdmin(
  supabase: SupabaseClient,
  query: PromptLibraryAdminListQuery,
): Promise<PromptLibraryAdminListResponse> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  let request = supabase
    .from(PROMPT_LIBRARY_TABLE)
    .select(PROMPT_LIBRARY_COLUMNS, { count: "exact" });
  if (!query.includeDeleted) request = request.is("deleted_at", null);
  if (query.q) {
    const pattern = `%${sanitizePostgrestSearch(query.q)}%`;
    request = request.or(`title.ilike.${pattern},content.ilike.${pattern},created_by_email.ilike.${pattern}`);
  }
  request = request.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);

  const { data, error, count } = await request;
  if (error) throw databaseError(error.message);
  const items = (Array.isArray(data) ? data : []).map((row) => promptLibraryRowToClient(row as PromptLibraryRow));
  const total = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : items.length;
  return {
    items,
    total,
    page: query.page,
    pageSize: query.pageSize,
    hasMore: from + items.length < total,
  };
}

export async function createPromptLibraryItemForAdmin(
  supabase: SupabaseClient,
  value: unknown,
  actor: PromptLibraryOwner,
): Promise<PromptLibraryItem> {
  const payload = normalizePromptLibraryPayload(value);
  const { data, error } = await supabase
    .from(PROMPT_LIBRARY_TABLE)
    .insert({
      created_by: UUID_PATTERN.test(actor.userId) ? actor.userId : null,
      created_by_email: normalizeEmail(actor.email),
      metadata: {},
      ...payload,
    })
    .select(PROMPT_LIBRARY_COLUMNS)
    .single();
  if (error) throw databaseError(error.message);
  return promptLibraryRowToClient(data as PromptLibraryRow);
}

export async function updatePromptLibraryItemForAdmin(
  supabase: SupabaseClient,
  id: string,
  value: unknown,
): Promise<PromptLibraryItem> {
  return updatePromptLibraryItem(supabase, id, value);
}

export async function softDeletePromptLibraryItemForAdmin(
  supabase: SupabaseClient,
  id: string,
): Promise<{ id: string }> {
  return softDeletePromptLibraryItem(supabase, id);
}

export function promptLibraryRowToClient(row: PromptLibraryRow): PromptLibraryItem {
  return {
    id: stringValue(row.id),
    title: stringValue(row.title),
    content: stringValue(row.content),
    creationType: stringValue(row.creation_type) || PROMPT_LIBRARY_DEFAULT_CREATION_TYPE,
    moduleKey: normalizeIdentifier(row.module_key),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdBy: nullableString(row.created_by),
    createdByEmail: nullableString(row.created_by_email),
    createdAt: dateString(row.created_at),
    updatedAt: dateString(row.updated_at),
  };
}

export function isPromptLibraryId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function assertUuid(id: string) {
  if (!UUID_PATTERN.test(id)) {
    throw new PromptLibraryError("提示词 ID 无效", 400, "INVALID_PROMPT_ID");
  }
}

function applyCursor<T extends { or: (filters: string) => T }>(request: T, cursor: string | null) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return request;
  return request.or(`created_at.lt.${decoded.at},and(created_at.eq.${decoded.at},id.lt.${decoded.id})`);
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

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.slice(0, 320) || null;
}

function normalizeSearchQuery(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function sanitizePostgrestSearch(value: string) {
  return value.replace(/[,()%]/g, " ").replace(/\s+/g, " ").trim();
}

function clampPageSize(value: unknown, fallback: number, max: number) {
  // 注意：缺失的参数是 null，直接 Number(null) 会得到 0（有限值），
  // 从而把「未传 limit」错误地钳成 1。必须先确认是有效字符串再解析。
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), max) : fallback;
}

function clampPageNumber(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return 1;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(Math.trunc(parsed), 10_000) : 1;
}

function databaseError(message: string) {
  return new PromptLibraryError(message || "词库服务异常", 500, "DATABASE_ERROR");
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

function dateString(value: unknown) {
  const parsed = typeof value === "string" ? value : "";
  return Number.isFinite(Date.parse(parsed)) ? parsed : new Date(0).toISOString();
}
