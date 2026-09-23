import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  enforceApiRateLimit: vi.fn(),
  listPromptLibraryItems: vi.fn(),
  createPromptLibraryItem: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  API_RATE_LIMITS: { historyRead: { bucket: "history" }, favoriteMutation: { bucket: "favorite" } },
  enforceApiRateLimit: mocks.enforceApiRateLimit,
}));
// 只替换数据访问函数：真实的 PromptLibraryError / parsePromptLibraryListQuery 参与测试，
// 这样「默认共享范围」与错误码映射都是走真实实现的。
vi.mock("@/lib/prompt-library/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/prompt-library/server")>();
  return {
    ...actual,
    listPromptLibraryItems: mocks.listPromptLibraryItems,
    createPromptLibraryItem: mocks.createPromptLibraryItem,
  };
});

import { GET, POST } from "@/app/api/prompt-library/route";
import { PromptLibraryError } from "@/lib/prompt-library/server";

const ITEM_ID = "2b5d98f0-8e4f-4f62-95c8-98dc30a432cb";

describe("prompt library API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: { id: "user-1", email: "me@example.com" },
      response: null,
    });
    mocks.enforceApiRateLimit.mockResolvedValue(null);
  });

  it("defaults to the shared library when no scope is requested", async () => {
    mocks.listPromptLibraryItems.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

    const response = await GET(new Request("http://localhost/api/prompt-library?q=%E5%A4%8F%E6%97%A5&limit=5"));

    expect(response.status).toBe(200);
    expect(mocks.listPromptLibraryItems).toHaveBeenCalledWith(
      { client: true },
      { scope: "all", creationType: null, moduleKey: null, q: "夏日", cursor: null, limit: 5 },
      { viewerId: "user-1" },
    );
    await expect(response.json()).resolves.toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it("passes scope=mine through for the private view", async () => {
    mocks.listPromptLibraryItems.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

    await GET(new Request("http://localhost/api/prompt-library?scope=mine"));

    expect(mocks.listPromptLibraryItems).toHaveBeenCalledWith(
      { client: true },
      expect.objectContaining({ scope: "mine" }),
      { viewerId: "user-1" },
    );
  });

  it("does not read the library when authentication fails", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost/api/prompt-library"));

    expect(response.status).toBe(401);
    expect(mocks.listPromptLibraryItems).not.toHaveBeenCalled();
  });

  it("returns the rate-limit response before touching the library", async () => {
    mocks.enforceApiRateLimit.mockResolvedValue(
      NextResponse.json({ error: "请求过于频繁" }, { status: 429 }),
    );

    const response = await GET(new Request("http://localhost/api/prompt-library"));

    expect(response.status).toBe(429);
    expect(mocks.listPromptLibraryItems).not.toHaveBeenCalled();
  });

  it("saves my prompt as the signed-in owner", async () => {
    mocks.createPromptLibraryItem.mockResolvedValue({
      id: ITEM_ID,
      title: "夏日女装主图",
      content: "a summer dress on a beach",
      creationType: "general-image",
      moduleKey: "generalImage",
      metadata: {},
      createdBy: "user-1",
      createdByEmail: "me@example.com",
      createdAt: "2026-09-23T02:00:00.000Z",
      updatedAt: "2026-09-23T02:00:00.000Z",
    });

    const body = { title: "夏日女装主图", content: "a summer dress on a beach" };
    const response = await POST(new Request("http://localhost/api/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createPromptLibraryItem).toHaveBeenCalledWith(
      { client: true },
      { userId: "user-1", email: "me@example.com" },
      body,
    );
    await expect(response.json()).resolves.toMatchObject({ prompt: { id: ITEM_ID } });
  });

  it("does not save anything for anonymous callers", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await POST(new Request("http://localhost/api/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", content: "c" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.createPromptLibraryItem).not.toHaveBeenCalled();
  });

  it("maps the 2000-character content limit to a 400 with a clear message", async () => {
    mocks.createPromptLibraryItem.mockRejectedValue(
      new PromptLibraryError("提示词内容需为 1-2000 个字符（当前 2001 个字）", 400, "INVALID_PROMPT_CONTENT"),
    );

    const response = await POST(new Request("http://localhost/api/prompt-library", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", content: "x".repeat(2001) }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_PROMPT_CONTENT",
      error: expect.stringContaining("2001"),
    });
  });
});
