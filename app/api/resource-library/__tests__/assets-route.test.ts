import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  enforceApiRateLimit: vi.fn(),
  parseResourceLibraryAssetListQuery: vi.fn(),
  listResourceLibraryAssets: vi.fn(),
  saveGenerationAssets: vi.fn(),
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  API_RATE_LIMITS: { historyRead: { bucket: "history" }, favoriteMutation: { bucket: "favorite" } },
  enforceApiRateLimit: mocks.enforceApiRateLimit,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/resource-library/server", () => ({
  ResourceLibraryError: class ResourceLibraryError extends Error {},
  parseResourceLibraryAssetListQuery: mocks.parseResourceLibraryAssetListQuery,
  listResourceLibraryAssets: mocks.listResourceLibraryAssets,
  saveGenerationAssets: mocks.saveGenerationAssets,
}));

import { GET, POST } from "@/app/api/resource-library/assets/route";

describe("resource library assets API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: { id: "user-1" },
      response: null,
    });
    mocks.enforceApiRateLimit.mockResolvedValue(null);
    mocks.getAdminClient.mockReturnValue({ admin: true });
  });

  it("lists only through the authenticated user's scoped service", async () => {
    const parsed = { source: null, moduleKey: null, mediaType: null, view: null, cursor: null, limit: 24 };
    mocks.parseResourceLibraryAssetListQuery.mockReturnValue(parsed);
    mocks.listResourceLibraryAssets.mockResolvedValue({ items: [], hasMore: false, nextCursor: null });

    const response = await GET(new Request("http://localhost/api/resource-library/assets?limit=24"));

    expect(response.status).toBe(200);
    expect(mocks.listResourceLibraryAssets).toHaveBeenCalledWith({ client: true }, "user-1", parsed);
    await expect(response.json()).resolves.toEqual({ items: [], hasMore: false, nextCursor: null });
  });

  it("passes only the generation descriptor to the save service", async () => {
    const body = { generationId: "2b5d98f0-8e4f-4f62-95c8-98dc30a432cb", resultIndex: 0 };
    mocks.saveGenerationAssets.mockResolvedValue([{ id: "asset-1" }]);

    const response = await POST(new Request("http://localhost/api/resource-library/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(200);
    expect(mocks.saveGenerationAssets).toHaveBeenCalledWith({ admin: true }, "user-1", body);
    await expect(response.json()).resolves.toEqual({ assets: [{ id: "asset-1" }] });
  });

  it("does not invoke storage when authentication fails", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await GET(new Request("http://localhost/api/resource-library/assets"));

    expect(response.status).toBe(401);
    expect(mocks.listResourceLibraryAssets).not.toHaveBeenCalled();
  });
});
