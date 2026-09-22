import { describe, expect, it, vi } from "vitest";

import type { AiResolvedDeployment } from "@/lib/ai-control-plane/types";
import { KIE_JOB_CREATE_TASK_PATH, KIE_JOB_RECORD_INFO_PATH, generateImageWithKieJob } from "@/lib/api/kie-job";
import {
  KIE_FILE_BASE64_UPLOAD_PATH,
  createKieReferenceImageResolver,
} from "@/lib/api/kie-reference-image.server";

/** 测试用假密钥：绝不使用真实 kie key。 */
const TEST_API_KEY = "test-kie-api-key";
const ASSET_ID = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const INTERNAL_URL = `http://192.168.31.213:3000/api/media-assets/${ASSET_ID}`;
const PUBLIC_URL = "https://cdn.example.com/source.png";
const UPLOAD_DOWNLOAD_URL = `https://tempfile.redpandaai.co/kieai/11656613/images/user-uploads/ref-${ASSET_ID}.jpg`;

function kieDeployment(): AiResolvedDeployment {
  return {
    id: "kie-banana2-primary",
    modelId: "nano-banana-2",
    providerId: "kie",
    upstreamModel: "nano-banana-2",
    protocol: "kie-job",
    enabled: true,
    priority: 10,
    weight: 100,
    maxConcurrency: 8,
    requestsPerMinute: 60,
    burst: 4,
    adapterConfig: { editUpstreamModel: "nano-banana-2-edit", imageInputField: "image_input" },
    provider: {
      id: "kie",
      name: "kie.ai",
      baseUrl: "https://api.kie.ai",
      enabled: true,
      timeoutMs: 120_000,
    },
    apiKey: TEST_API_KEY,
    health: {
      deploymentId: "kie-banana2-primary",
      circuitState: "closed",
      consecutiveFailures: 0,
      sampleCount: 0,
      ewmaSuccessRate: 1,
      ewmaLatencyMs: 0,
    },
    score: 1,
    selectionReason: {},
  };
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

type RecordedCall = { url: string; method: string; body: Record<string, unknown> | undefined };

/** 按 URL 路由的假 fetch：分别处理 kie 文件上传、createTask 与 recordInfo。 */
function kieFetchMock(options: { uploadStatus?: number } = {}) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url: target, method: String(init?.method || "GET"), body });

    if (target.includes(KIE_FILE_BASE64_UPLOAD_PATH)) {
      if (options.uploadStatus && options.uploadStatus >= 400) {
        return jsonResponse({ code: options.uploadStatus, msg: "Unauthorized" }, options.uploadStatus);
      }
      return jsonResponse({
        success: true,
        code: 200,
        msg: "File uploaded successfully",
        data: { fileName: `ref-${ASSET_ID}.jpg`, filePath: "kieai/1/images/user-uploads/x.jpg", downloadUrl: UPLOAD_DOWNLOAD_URL },
      });
    }
    if (target.includes(KIE_JOB_CREATE_TASK_PATH)) {
      return jsonResponse({ code: 200, msg: "success", data: { taskId: "task-ref" } });
    }
    return jsonResponse({
      code: 200,
      msg: "success",
      data: { taskId: "task-ref", state: "success", resultJson: '{"resultUrls":["https://cdn.example.com/out.png"]}' },
    });
  });
  return { fetchMock: fetchMock as unknown as typeof fetch, calls };
}

function stubBytesLoader() {
  return vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", sourceId: ASSET_ID }));
}

describe("kie 图生图提交前的参考图转存", () => {
  it("内网参考图先上传，用它返回的 downloadUrl 提交任务", async () => {
    const { fetchMock, calls } = kieFetchMock();
    const resolve = createKieReferenceImageResolver({
      loadBytes: stubBytesLoader(),
      fetchImpl: fetchMock,
      log: () => {},
    });

    const result = await generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: TEST_API_KEY,
      prompt: "swap the shirt",
      imageUrls: [INTERNAL_URL],
      resolveImageUrls: resolve,
      fetchImpl: fetchMock,
      sleepImpl: async () => {},
    });

    expect(result).toEqual({ taskId: "task-ref", urls: ["https://cdn.example.com/out.png"] });
    const uploadCall = calls.find((call) => call.url.includes(KIE_FILE_BASE64_UPLOAD_PATH));
    expect(uploadCall).toBeDefined();
    const submitCall = calls.find((call) => call.url.includes(KIE_JOB_CREATE_TASK_PATH));
    expect(submitCall).toBeDefined();
    expect(submitCall?.body).toEqual({
      model: "nano-banana-2-edit",
      input: { prompt: "swap the shirt", image_input: [UPLOAD_DOWNLOAD_URL] },
    });
    // 内网地址绝不能进入提交给 kie 的请求体。
    expect(JSON.stringify(submitCall?.body)).not.toContain("192.168.31.213");
  });

  it("公网参考图不触发上传，URL 原样提交", async () => {
    const { fetchMock, calls } = kieFetchMock();
    const loadBytes = stubBytesLoader();
    const resolve = createKieReferenceImageResolver({ loadBytes, fetchImpl: fetchMock, log: () => {} });

    await generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: TEST_API_KEY,
      prompt: "swap the shirt",
      imageUrls: [PUBLIC_URL],
      resolveImageUrls: resolve,
      fetchImpl: fetchMock,
      sleepImpl: async () => {},
    });

    expect(loadBytes).not.toHaveBeenCalled();
    expect(calls.some((call) => call.url.includes(KIE_FILE_BASE64_UPLOAD_PATH))).toBe(false);
    const submitCall = calls.find((call) => call.url.includes(KIE_JOB_CREATE_TASK_PATH));
    expect(submitCall?.body).toEqual({
      model: "nano-banana-2-edit",
      input: { prompt: "swap the shirt", image_input: [PUBLIC_URL] },
    });
  });

  it("参考图转存失败时不提交任务，并按既有错误类型抛出", async () => {
    const { fetchMock, calls } = kieFetchMock({ uploadStatus: 401 });
    const resolve = createKieReferenceImageResolver({
      loadBytes: stubBytesLoader(),
      fetchImpl: fetchMock,
      log: () => {},
    });

    await expect(generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: TEST_API_KEY,
      prompt: "swap the shirt",
      imageUrls: [INTERNAL_URL],
      resolveImageUrls: resolve,
      fetchImpl: fetchMock,
      sleepImpl: async () => {},
    })).rejects.toMatchObject({
      name: "ProviderHttpResponseError",
      status: 401,
      safeToFailover: true,
      code: "KIE_REFERENCE_IMAGE_UPLOAD_401",
    });

    expect(calls.some((call) => call.url.includes(KIE_JOB_CREATE_TASK_PATH))).toBe(false);
    expect(calls.filter((call) => call.method === "GET")).toHaveLength(0);
  });

  it("未注入解析器时保持原有行为（ kie 直接拿到原地址）", async () => {
    const { fetchMock, calls } = kieFetchMock();

    await generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: TEST_API_KEY,
      prompt: "swap the shirt",
      imageUrls: [PUBLIC_URL],
      fetchImpl: fetchMock,
      sleepImpl: async () => {},
    });

    expect(calls.some((call) => call.url.includes(KIE_FILE_BASE64_UPLOAD_PATH))).toBe(false);
    const submitCall = calls.find((call) => call.url.includes(KIE_JOB_CREATE_TASK_PATH));
    expect((submitCall?.body?.input as { image_input?: string[] })?.image_input).toEqual([PUBLIC_URL]);
    expect(calls[0].url).toBe("https://api.kie.ai" + KIE_JOB_CREATE_TASK_PATH);
    expect(calls.at(-1)?.url).toContain(KIE_JOB_RECORD_INFO_PATH);
  });
});
