import { describe, expect, it, vi } from "vitest";
import {
  PROMPT_LIBRARY_CONTENT_MAX_LENGTH,
  PROMPT_LIBRARY_TITLE_MAX_LENGTH,
} from "@/lib/prompt-library/types";
import {
  PromptLibraryError,
  createPromptLibraryItem,
  createPromptLibraryItemForAdmin,
  listPromptLibraryItems,
  listPromptLibraryItemsForAdmin,
  normalizePromptLibraryPayload,
  parsePromptLibraryAdminListQuery,
  parsePromptLibraryListQuery,
  promptLibraryRowToClient,
  softDeletePromptLibraryItem,
  softDeletePromptLibraryItemForAdmin,
  updatePromptLibraryItem,
  updatePromptLibraryItemForAdmin,
} from "@/lib/prompt-library/server";

const OWNER_ID = "8f4b2c1e-1111-4222-8333-444455556666";
const OTHER_ID = "1a2b3c4d-5555-4666-8777-888899990000";
const ITEM_ID = "2b5d98f0-8e4f-4f62-95c8-98dc30a432cb";

type MockResult = {
  rows?: unknown;
  singleRow?: unknown;
  error?: { message: string } | null;
  count?: number | null;
};

/**
 * Minimal PostgREST query-builder double: every builder method returns the same object
 * so the production code can chain freely, and the object is thenable so `await request`
 * resolves like a real supabase-js builder.
 */
function createSupabaseMock(result: MockResult = {}) {
  type MockFn = ReturnType<typeof vi.fn>;
  const query: Record<string, MockFn> = {};
  for (const method of [
    "select",
    "insert",
    "update",
    "eq",
    "is",
    "order",
    "limit",
    "range",
    "or",
    "ilike",
    "in",
    "not",
  ]) {
    query[method] = vi.fn(() => query);
  }
  const resolved = () => ({
    data: result.rows ?? null,
    error: result.error ?? null,
    count: result.count ?? null,
  });
  const single = async () => ({
    data: (result.singleRow ?? result.rows ?? null) as unknown,
    error: result.error ?? null,
  });
  query.maybeSingle = vi.fn(single);
  query.single = vi.fn(single);
  // `await builder` needs a callable `then`; a vi.fn keeps the record uniformly typed.
  query.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolved()).then(resolve));

  const from = vi.fn(() => query);
  return { supabase: { from } as never, query, from };
}

function promptRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: "夏日女装主图",
    content: "a summer dress on a beach, soft light",
    creation_type: "general-image",
    module_key: "generalImage",
    metadata: {},
    created_by: OTHER_ID,
    created_by_email: "other@example.com",
    created_at: "2026-09-23T02:00:00.000Z",
    updated_at: "2026-09-23T02:00:00.000Z",
    ...overrides,
  };
}

describe("prompt library server helpers", () => {
  it("defaults the list scope to the shared library and clamps the page size", () => {
    expect(parsePromptLibraryListQuery(new URLSearchParams())).toEqual({
      scope: "all",
      creationType: null,
      moduleKey: null,
      q: "",
      cursor: null,
      limit: 30,
    });

    expect(parsePromptLibraryListQuery(new URLSearchParams({
      scope: "mine",
      creationType: " general-image ",
      module: "generalImage",
      q: "  夏日   主图  ",
      limit: "999",
    }))).toMatchObject({
      scope: "mine",
      creationType: "general-image",
      moduleKey: "generalImage",
      q: "夏日 主图",
      limit: 60,
    });

    // 非法 scope 必须回退到共享词库（默认可见范围），而不是报错或变成私有。
    expect(parsePromptLibraryListQuery(new URLSearchParams({ scope: "everything" })).scope).toBe("all");
  });

  it("parses the admin list query with page bounds", () => {
    expect(parsePromptLibraryAdminListQuery(new URLSearchParams())).toEqual({
      q: "",
      page: 1,
      pageSize: 20,
      includeDeleted: false,
    });
    expect(parsePromptLibraryAdminListQuery(new URLSearchParams({
      q: "  beach ",
      page: "3",
      pageSize: "500",
      includeDeleted: "true",
    }))).toEqual({ q: "beach", page: 3, pageSize: 100, includeDeleted: true });
  });

  it("trims payloads, defaults the creation type and enforces the 20/2000 length limits", () => {
    expect(normalizePromptLibraryPayload({
      title: "  夏日海报  ",
      content: "  product photo  ",
      moduleKey: "generalImage",
    })).toEqual({
      title: "夏日海报",
      content: "product photo",
      creation_type: "general-image",
      module_key: "generalImage",
    });

    // 边界：正好 20 / 2000 个字可以通过。
    const maxTitle = "标".repeat(PROMPT_LIBRARY_TITLE_MAX_LENGTH);
    const maxContent = "字".repeat(PROMPT_LIBRARY_CONTENT_MAX_LENGTH);
    expect(normalizePromptLibraryPayload({ title: maxTitle, content: maxContent })).toMatchObject({
      title: maxTitle,
      content: maxContent,
    });

    // 超限：报错信息带上当前字数，便于前端直接展示。
    expect(() => normalizePromptLibraryPayload({
      title: "标".repeat(PROMPT_LIBRARY_TITLE_MAX_LENGTH + 1),
      content: "ok",
    })).toThrowError(expect.objectContaining({
      code: "INVALID_PROMPT_TITLE",
      status: 400,
      message: expect.stringContaining(String(PROMPT_LIBRARY_TITLE_MAX_LENGTH + 1)),
    }));

    expect(() => normalizePromptLibraryPayload({
      title: "ok",
      content: "字".repeat(PROMPT_LIBRARY_CONTENT_MAX_LENGTH + 1),
    })).toThrowError(expect.objectContaining({
      code: "INVALID_PROMPT_CONTENT",
      status: 400,
      message: expect.stringContaining(String(PROMPT_LIBRARY_CONTENT_MAX_LENGTH + 1)),
    }));

    expect(() => normalizePromptLibraryPayload({ title: "   ", content: "ok" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_PROMPT_TITLE" }));
    expect(() => normalizePromptLibraryPayload({ title: "ok", content: "   " }))
      .toThrowError(expect.objectContaining({ code: "INVALID_PROMPT_CONTENT" }));
  });

  it("rejects empty partial updates and invalid creation types", () => {
    expect(() => normalizePromptLibraryPayload({}, { partial: true }))
      .toThrowError(expect.objectContaining({ code: "EMPTY_PROMPT_UPDATE" }));
    expect(() => normalizePromptLibraryPayload({ title: "ok", content: "ok", creationType: "1bad" }))
      .toThrowError(expect.objectContaining({ code: "INVALID_CREATION_TYPE" }));
    expect(normalizePromptLibraryPayload({ title: "ok", content: "ok" }, { partial: true }))
      .toEqual({ title: "ok", content: "ok" });
  });

  it("lists the shared library without scoping to the current user", async () => {
    const { supabase, query } = createSupabaseMock({
      rows: [promptRow(), promptRow({ id: OWNER_ID, created_by: OWNER_ID, created_by_email: "me@example.com" })],
    });

    const result = await listPromptLibraryItems(supabase, {
      scope: "all",
      creationType: null,
      moduleKey: null,
      q: "",
      cursor: null,
      limit: 30,
    }, { viewerId: OWNER_ID });

    // 共享词库不能带 created_by 过滤 —— 否则就退化成「只看自己的」。
    expect(query.eq).not.toHaveBeenCalledWith("created_by", expect.anything());
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.limit).toHaveBeenCalledWith(31);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: ITEM_ID,
      title: "夏日女装主图",
      createdBy: OTHER_ID,
      createdByEmail: "other@example.com",
      creationType: "general-image",
    });
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it("scopes the list to the viewer when scope is mine", async () => {
    const { supabase, query } = createSupabaseMock({ rows: [promptRow({ created_by: OWNER_ID })] });

    await listPromptLibraryItems(supabase, {
      scope: "mine",
      creationType: null,
      moduleKey: null,
      q: "",
      cursor: null,
      limit: 30,
    }, { viewerId: OWNER_ID });

    expect(query.eq).toHaveBeenCalledWith("created_by", OWNER_ID);
  });

  it("refuses a private (mine) listing without a viewer", async () => {
    const { supabase } = createSupabaseMock({ rows: [] });
    await expect(listPromptLibraryItems(supabase, {
      scope: "mine",
      creationType: null,
      moduleKey: null,
      q: "",
      cursor: null,
      limit: 30,
    })).rejects.toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED", status: 401 }));
  });

  it("sanitizes the search keyword before it reaches PostgREST", async () => {
    const { supabase, query } = createSupabaseMock({ rows: [] });
    await listPromptLibraryItems(supabase, {
      scope: "all",
      creationType: null,
      moduleKey: null,
      q: "a,b(c)%d",
      cursor: null,
      limit: 10,
    });

    const [filter] = query.or.mock.calls.at(-1) as [string];
    // 关键词里的 , ( ) % 会被替换为空格，避免注入 PostgREST 的 or 语法。
    expect(filter).toBe("title.ilike.%a b c d%,content.ilike.%a b c d%");
    expect(filter).not.toContain("(c)");
  });

  it("paginates the shared list with the created_at cursor", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => promptRow({
      id: `2b5d98f0-8e4f-4f62-95c8-98dc30a432c${index + 1}`,
      created_at: `2026-09-2${3 - index}T02:00:00.000Z`,
    }));
    const { supabase } = createSupabaseMock({ rows });

    const result = await listPromptLibraryItems(supabase, {
      scope: "all",
      creationType: null,
      moduleKey: null,
      q: "",
      cursor: null,
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBeTruthy();
    expect(Buffer.from(String(result.nextCursor), "base64url").toString("utf8"))
      .toContain("2026-09-22T02:00:00.000Z");
  });

  it("attributes new items to the signed-in user", async () => {
    const { supabase, query } = createSupabaseMock({ singleRow: promptRow({ created_by: OWNER_ID }) });

    const item = await createPromptLibraryItem(supabase, { userId: OWNER_ID, email: "  ME@Example.com " }, {
      title: "夏日女装主图",
      content: "a summer dress on a beach",
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: OWNER_ID,
      created_by_email: "me@example.com",
      metadata: {},
      title: "夏日女装主图",
      content: "a summer dress on a beach",
      creation_type: "general-image",
    }));
    expect(item.createdByEmail).toBe("other@example.com");
  });

  it("refuses to create without a valid owner id", async () => {
    const { supabase } = createSupabaseMock({ singleRow: promptRow() });
    await expect(createPromptLibraryItem(supabase, { userId: "not-a-uuid" }, { title: "t", content: "c" }))
      .rejects.toThrowError(expect.objectContaining({ code: "UNAUTHENTICATED", status: 401 }));
  });

  it("updates only the owner's own row and reports missing rows as 404", async () => {
    const { supabase, query } = createSupabaseMock({ singleRow: promptRow({ created_by: OWNER_ID }) });

    await updatePromptLibraryItem(supabase, ITEM_ID, { title: "新的标题" }, { ownerId: OWNER_ID });

    expect(query.update).toHaveBeenCalledWith({ title: "新的标题" });
    expect(query.eq).toHaveBeenCalledWith("id", ITEM_ID);
    expect(query.eq).toHaveBeenCalledWith("created_by", OWNER_ID);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);

    const missing = createSupabaseMock({ singleRow: null });
    await expect(updatePromptLibraryItem(missing.supabase, ITEM_ID, { title: "x" }, { ownerId: OWNER_ID }))
      .rejects.toThrowError(expect.objectContaining({ code: "PROMPT_NOT_FOUND", status: 404 }));

    await expect(updatePromptLibraryItem(supabase, "not-a-uuid", { title: "x" }))
      .rejects.toThrowError(expect.objectContaining({ code: "INVALID_PROMPT_ID", status: 400 }));
  });

  it("soft deletes by writing deleted_at instead of removing the row", async () => {
    const { supabase, query } = createSupabaseMock({ singleRow: { id: ITEM_ID } });

    const deleted = await softDeletePromptLibraryItem(supabase, ITEM_ID, { ownerId: OWNER_ID });

    expect(deleted).toEqual({ id: ITEM_ID });
    const [payload] = query.update.mock.calls.at(-1) as [Record<string, unknown>];
    expect(Object.keys(payload)).toEqual(["deleted_at"]);
    expect(Number.isFinite(Date.parse(String(payload.deleted_at)))).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("created_by", OWNER_ID);
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    // 绝不做物理删除
    expect(query).not.toHaveProperty("delete");

    const missing = createSupabaseMock({ singleRow: null });
    await expect(softDeletePromptLibraryItem(missing.supabase, ITEM_ID))
      .rejects.toThrowError(expect.objectContaining({ code: "PROMPT_NOT_FOUND", status: 404 }));
  });

  it("lists for the admin console with count and range pagination", async () => {
    const { supabase, query } = createSupabaseMock({
      rows: [promptRow(), promptRow({ id: OWNER_ID })],
      count: 42,
    });

    const result = await listPromptLibraryItemsForAdmin(supabase, {
      q: "beach",
      page: 2,
      pageSize: 20,
      includeDeleted: false,
    });

    expect(query.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.range).toHaveBeenCalledWith(20, 39);
    expect(result).toMatchObject({ total: 42, page: 2, pageSize: 20, hasMore: true });
    expect(result.items).toHaveLength(2);
  });

  it("can include soft-deleted rows when the admin asks for them", async () => {
    const { supabase, query } = createSupabaseMock({ rows: [], count: 0 });
    await listPromptLibraryItemsForAdmin(supabase, { q: "", page: 1, pageSize: 20, includeDeleted: true });
    expect(query.is).not.toHaveBeenCalledWith("deleted_at", null);
  });

  it("lets the admin console write and delete rows without an owner filter", async () => {
    const created = createSupabaseMock({ singleRow: promptRow({ created_by: OWNER_ID }) });
    await createPromptLibraryItemForAdmin(created.supabase, { title: "后台新增", content: "admin content" }, {
      userId: OWNER_ID,
      email: "ADMIN@Example.com",
    });
    expect(created.query.insert).toHaveBeenCalledWith(expect.objectContaining({
      created_by: OWNER_ID,
      created_by_email: "admin@example.com",
    }));

    const updated = createSupabaseMock({ singleRow: promptRow() });
    await updatePromptLibraryItemForAdmin(updated.supabase, ITEM_ID, { content: "新的内容" });
    expect(updated.query.eq).not.toHaveBeenCalledWith("created_by", expect.anything());
    expect(updated.query.eq).toHaveBeenCalledWith("id", ITEM_ID);

    const removed = createSupabaseMock({ singleRow: { id: ITEM_ID } });
    await expect(softDeletePromptLibraryItemForAdmin(removed.supabase, ITEM_ID)).resolves.toEqual({ id: ITEM_ID });
    expect(removed.query.eq).not.toHaveBeenCalledWith("created_by", expect.anything());
  });

  it("keeps the creator nullable in the client contract", () => {
    expect(promptLibraryRowToClient({
      id: ITEM_ID,
      title: "共享条目",
      content: "shared",
      creation_type: null,
      module_key: null,
      metadata: null,
      created_by: null,
      created_by_email: null,
      created_at: "2026-09-23T02:00:00.000Z",
      updated_at: "not-a-date",
    })).toEqual({
      id: ITEM_ID,
      title: "共享条目",
      content: "shared",
      creationType: "general-image",
      moduleKey: null,
      metadata: {},
      createdBy: null,
      createdByEmail: null,
      createdAt: "2026-09-23T02:00:00.000Z",
      updatedAt: new Date(0).toISOString(),
    });

    expect(new PromptLibraryError("boom")).toMatchObject({ name: "PromptLibraryError", status: 500 });
  });
});
