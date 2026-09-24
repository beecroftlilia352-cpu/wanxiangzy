import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import type { AiControlPlaneConfig } from "@/lib/ai-control-plane/types";

/**
 * GET /api/product-title/models 路由单测。
 * 上游 /models 由 fetch mock 提供（不发起任何真实网络请求），控制面配置也整体 mock。
 * 上游返回结构照抄实测响应（GET https://api.deepseek.com/models）。
 */

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  getAiControlPlaneConfig: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));

vi.mock("@/lib/ai-control-plane/server", () => ({
  getAiControlPlaneConfig: mocks.getAiControlPlaneConfig,
}));

// server.ts 顶层 import sharp，这里只用到 resolveDeepseekProvider，避免加载原生绑定。
vi.mock("sharp", () => ({ default: vi.fn() }));

import { GET } from "@/app/api/product-title/models/route";
import {
  fallbackProductTitleCatalog,
  invalidateProductTitleModelsCache,
} from "@/lib/product-title/models";
import { PRODUCT_TITLE_FALLBACK_MODELS, PRODUCT_TITLE_PROVIDER_ID } from "@/lib/product-title/types";

const DECRYPTED_KEY = "sk-decrypted-models-key";

const fetchMock = vi.fn();

/** 实测上游响应（深证模型清单）：flash 支持图片，v4-pro 只支持文本。 */
const UPSTREAM_MODELS = {
  object: "list",
  data: [
    {
      id: "deepseek-flash",
      object: "model",
      owned_by: "deepseek",
      name: "DeepSeek-V4.1-Flash",
      context_window: 1_048_576,
      max_output_tokens: 393_216,
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
      effort: { supported_levels: ["low", "high", "max"], default_level: "high" },
    },
    {
      id: "deepseek-v4-pro",
      object: "model",
      owned_by: "deepseek",
      name: "DeepSeek-V4-Pro",
      context_window: 1_048_576,
      max_output_tokens: 393_216,
      input_modalities: ["text"],
      output_modalities: ["text"],
      effort: { supported_levels: ["low", "high", "max"], default_level: "high" },
    },
  ],
};

function deepseekConfig(providers?: AiControlPlaneConfig["providers"]): AiControlPlaneConfig {
  return {
    version: 1,
    models: [],
    deployments: [],
    providers: providers ?? [
      {
        id: PRODUCT_TITLE_PROVIDER_ID,
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        apiKey: DECRYPTED_KEY,
        enabled: true,
        timeoutMs: 60_000,
      },
    ],
  } as unknown as AiControlPlaneConfig;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("GET /api/product-title/models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateProductTitleModelsCache();
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: { id: "user-1" },
      response: null,
    });
    mocks.getAiControlPlaneConfig.mockResolvedValue(deepseekConfig());
    fetchMock.mockImplementation(async () => jsonResponse(UPSTREAM_MODELS));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    invalidateProductTitleModelsCache();
  });

  it("未登录返回 401，且不请求上游", async () => {
    mocks.requireApiUser.mockResolvedValue({
      supabase: { client: true },
      user: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("正常返回能力表：vision 标记正确、fallback=false、带解密 key 请求上游 /models", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json() as {
      ok: boolean;
      fallback: boolean;
      models: Array<{ id: string; name: string; vision: boolean; contextWindow: number; maxOutputTokens: number; effortLevels: string[] }>;
    };

    expect(payload.ok).toBe(true);
    expect(payload.fallback).toBe(false);
    expect(payload.models.map((model) => model.id)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
    expect(payload.models[0]).toEqual({
      id: "deepseek-flash",
      name: "DeepSeek-V4.1-Flash",
      vision: true,
      contextWindow: 1_048_576,
      maxOutputTokens: 393_216,
      effortLevels: ["low", "high", "max"],
    });
    expect(payload.models[1].vision).toBe(false);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/models");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${DECRYPTED_KEY}`);
    // 密钥绝不能出现在给前端的响应里
    expect(JSON.stringify(payload)).not.toContain(DECRYPTED_KEY);
  });

  it("5 分钟缓存内第二次调用不再打上游", async () => {
    await GET();
    const second = await GET();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(second.json()).resolves.toMatchObject({ ok: true, fallback: false });
  });

  it("上游网络失败时回退到内置清单（fallback: true，flash=vision、v4-pro=非 vision）", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    });

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json() as { ok: boolean; fallback: boolean; models: Array<{ id: string; vision: boolean }> };
    expect(payload.ok).toBe(true);
    expect(payload.fallback).toBe(true);
    expect(payload.models).toEqual(fallbackProductTitleCatalog().models);
    expect(payload.models.find((model) => model.id === "deepseek-flash")?.vision).toBe(true);
    expect(payload.models.find((model) => model.id === "deepseek-v4-pro")?.vision).toBe(false);
  });

  it("上游返回非 2xx 或结构不认识时同样回退到内置清单", async () => {
    fetchMock.mockImplementation(async () => new Response("upstream-secret-detail", { status: 500 }));
    const failed = await GET();
    const failedPayload = await failed.json() as { fallback: boolean; models: unknown[]; error?: string };
    expect(failed.status).toBe(200);
    expect(failedPayload.fallback).toBe(true);
    expect(failedPayload.models).toHaveLength(PRODUCT_TITLE_FALLBACK_MODELS.length);
    expect(JSON.stringify(failedPayload)).not.toContain("upstream-secret-detail");

    invalidateProductTitleModelsCache();
    fetchMock.mockImplementation(async () => jsonResponse({ object: "list", data: [] }));
    const empty = await GET();
    await expect(empty.json()).resolves.toMatchObject({ ok: true, fallback: true });
  });

  it("上游超时也回退到内置清单", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    fetchMock.mockImplementation(async () => {
      throw timeout;
    });

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({ ok: true, fallback: true });
  });

  it("供应商未配置时也返回内置清单（前端不阻塞）", async () => {
    mocks.getAiControlPlaneConfig.mockResolvedValue(deepseekConfig([]));

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json() as { ok: boolean; fallback: boolean; models: Array<{ id: string; vision: boolean }> };
    expect(payload).toMatchObject({ ok: true, fallback: true });
    expect(payload.models.find((model) => model.id === "deepseek-flash")?.vision).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
