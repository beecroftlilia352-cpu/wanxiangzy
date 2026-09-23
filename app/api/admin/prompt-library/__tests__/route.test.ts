import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdminApi: vi.fn(),
  writeAdminAuditLog: vi.fn(),
  getAdminClient: vi.fn(),
  parsePromptLibraryAdminListQuery: vi.fn(),
  listPromptLibraryItemsForAdmin: vi.fn(),
  createPromptLibraryItemForAdmin: vi.fn(),
  updatePromptLibraryItemForAdmin: vi.fn(),
  softDeletePromptLibraryItemForAdmin: vi.fn(),
}));

vi.mock("@/lib/admin/auth", () => ({ requireAdminApi: mocks.requireAdminApi }));
vi.mock("@/lib/admin/audit", () => ({ writeAdminAuditLog: mocks.writeAdminAuditLog }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/prompt-library/server", () => ({
  PromptLibraryError: class PromptLibraryError extends Error {
    status: number;
    code: string;
    constructor(message: string, status = 500, code = "PROMPT_LIBRARY_ERROR") {
      super(message);
      this.name = "PromptLibraryError";
      this.status = status;
      this.code = code;
    }
  },
  parsePromptLibraryAdminListQuery: mocks.parsePromptLibraryAdminListQuery,
  listPromptLibraryItemsForAdmin: mocks.listPromptLibraryItemsForAdmin,
  createPromptLibraryItemForAdmin: mocks.createPromptLibraryItemForAdmin,
  updatePromptLibraryItemForAdmin: mocks.updatePromptLibraryItemForAdmin,
  softDeletePromptLibraryItemForAdmin: mocks.softDeletePromptLibraryItemForAdmin,
}));

import { GET, POST } from "@/app/api/admin/prompt-library/route";
import { DELETE, PATCH } from "@/app/api/admin/prompt-library/[id]/route";
import { PromptLibraryError } from "@/lib/prompt-library/server";

const ITEM_ID = "2b5d98f0-8e4f-4f62-95c8-98dc30a432cb";
const ADMIN_CONTEXT = { userId: "admin-1", email: "admin@example.com", role: "ops" };
const FORBIDDEN = NextResponse.json({ error: "当前角色无权执行该操作" }, { status: 403 });

function promptItem(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    title: "夏日女装主图",
    content: "a summer dress on a beach",
    creationType: "general-image",
    moduleKey: "generalImage",
    metadata: {},
    createdBy: "user-1",
    createdByEmail: "user@example.com",
    createdAt: "2026-09-23T02:00:00.000Z",
    updatedAt: "2026-09-23T02:00:00.000Z",
    ...overrides,
  };
}

describe("admin prompt library API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminApi.mockResolvedValue({ ok: true, context: ADMIN_CONTEXT });
    mocks.writeAdminAuditLog.mockResolvedValue(undefined);
    mocks.getAdminClient.mockReturnValue({ admin: true });
  });

  it("rejects callers without the prompts:read permission", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: FORBIDDEN });

    const response = await GET(new Request("http://localhost/api/admin/prompt-library"));

    expect(response.status).toBe(403);
    expect(mocks.requireAdminApi).toHaveBeenCalledWith("prompts:read");
    expect(mocks.listPromptLibraryItemsForAdmin).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "当前角色无权执行该操作" });
  });

  it("rejects mutations without the prompts:write permission", async () => {
    mocks.requireAdminApi.mockResolvedValue({ ok: false, response: FORBIDDEN });

    const post = await POST(new Request("http://localhost/api/admin/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", content: "c" }),
    }));
    const patch = await PATCH(new Request("http://localhost/api/admin/prompt-library/x", { method: "PATCH" }), {
      params: Promise.resolve({ id: ITEM_ID }),
    });
    const remove = await DELETE(new Request("http://localhost/api/admin/prompt-library/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: ITEM_ID }),
    });

    expect([post.status, patch.status, remove.status]).toEqual([403, 403, 403]);
    expect(mocks.requireAdminApi).toHaveBeenCalledWith("prompts:write");
    expect(mocks.createPromptLibraryItemForAdmin).not.toHaveBeenCalled();
    expect(mocks.updatePromptLibraryItemForAdmin).not.toHaveBeenCalled();
    expect(mocks.softDeletePromptLibraryItemForAdmin).not.toHaveBeenCalled();
    expect(mocks.writeAdminAuditLog).not.toHaveBeenCalled();
  });

  it("lists through the service-role client", async () => {
    const parsed = { q: "beach", page: 1, pageSize: 20, includeDeleted: false };
    mocks.parsePromptLibraryAdminListQuery.mockReturnValue(parsed);
    mocks.listPromptLibraryItemsForAdmin.mockResolvedValue({
      items: [promptItem()],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });

    const response = await GET(new Request("http://localhost/api/admin/prompt-library?q=beach"));

    expect(response.status).toBe(200);
    expect(mocks.listPromptLibraryItemsForAdmin).toHaveBeenCalledWith({ admin: true }, parsed);
    await expect(response.json()).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ title: "夏日女装主图", createdByEmail: "user@example.com" })],
    });
  });

  it("creates an item and records a prompt_library.create audit entry", async () => {
    mocks.createPromptLibraryItemForAdmin.mockResolvedValue(promptItem());

    const response = await POST(new Request("http://localhost/api/admin/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "夏日女装主图", content: "a summer dress on a beach" }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createPromptLibraryItemForAdmin).toHaveBeenCalledWith(
      { admin: true },
      { title: "夏日女装主图", content: "a summer dress on a beach" },
      { userId: "admin-1", email: "admin@example.com" },
    );
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      ADMIN_CONTEXT,
      expect.objectContaining({
        action: "prompt_library.create",
        resourceType: "prompt_library_item",
        resourceId: ITEM_ID,
      }),
    );
  });

  it("updates an item and records a prompt_library.update audit entry", async () => {
    mocks.updatePromptLibraryItemForAdmin.mockResolvedValue(promptItem({ title: "新标题" }));

    const response = await PATCH(new Request("http://localhost/api/admin/prompt-library/x", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新标题" }),
    }), { params: Promise.resolve({ id: ITEM_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.updatePromptLibraryItemForAdmin).toHaveBeenCalledWith(
      { admin: true },
      ITEM_ID,
      { title: "新标题" },
    );
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      ADMIN_CONTEXT,
      expect.objectContaining({ action: "prompt_library.update", resourceId: ITEM_ID }),
    );
  });

  it("soft deletes an item and records a prompt_library.delete audit entry", async () => {
    mocks.softDeletePromptLibraryItemForAdmin.mockResolvedValue({ id: ITEM_ID });

    const response = await DELETE(new Request("http://localhost/api/admin/prompt-library/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: ITEM_ID }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, id: ITEM_ID });
    expect(mocks.writeAdminAuditLog).toHaveBeenCalledWith(
      ADMIN_CONTEXT,
      expect.objectContaining({
        action: "prompt_library.delete",
        resourceType: "prompt_library_item",
        resourceId: ITEM_ID,
      }),
    );
  });

  it("surfaces validation failures from the service without writing an audit entry", async () => {
    mocks.createPromptLibraryItemForAdmin.mockRejectedValue(
      new PromptLibraryError("提示词内容需为 1-2000 个字符（当前 2001 个字）", 400, "INVALID_PROMPT_CONTENT"),
    );

    const response = await POST(new Request("http://localhost/api/admin/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", content: "x".repeat(2001) }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "提示词内容需为 1-2000 个字符（当前 2001 个字）",
      code: "INVALID_PROMPT_CONTENT",
    });
    expect(mocks.writeAdminAuditLog).not.toHaveBeenCalled();
  });
});
