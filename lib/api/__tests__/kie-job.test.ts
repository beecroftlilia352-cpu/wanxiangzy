import { afterEach, describe, expect, it, vi } from "vitest";

import type { AiDeploymentAdapterConfig, AiResolvedDeployment } from "@/lib/ai-control-plane/types";
import { NonRetryableGenerationError, ProviderHttpResponseError, RetryableGenerationError } from "@/lib/api/generation-errors";
import {
  KIE_JOB_CREATE_TASK_PATH,
  KIE_JOB_RECORD_INFO_PATH,
  buildKieCreateTaskBody,
  buildKieJobHeaders,
  createKieEnvelopeError,
  generateImageWithKieJob,
  parseKieCreateTaskResponse,
  parseKieRecordInfoResponse,
  resolveKieImageInputField,
  resolveKieImageSizeField,
  resolveKieUpstreamModel,
  __kieJobTestUtils,
} from "@/lib/api/kie-job";

const { readKieResultUrls, describeKieResponseKeys } = __kieJobTestUtils;

function kieDeployment(adapterConfig?: AiDeploymentAdapterConfig, upstreamModel = "nano-banana-2"): AiResolvedDeployment {
  return {
    id: "kie-banana2-primary",
    modelId: "nano-banana-2",
    providerId: "kie",
    upstreamModel,
    protocol: "kie-job",
    enabled: true,
    priority: 10,
    weight: 100,
    maxConcurrency: 8,
    requestsPerMinute: 60,
    burst: 4,
    adapterConfig,
    provider: {
      id: "kie",
      name: "kie.ai",
      baseUrl: "https://api.kie.ai",
      enabled: true,
      timeoutMs: 120_000,
    },
    apiKey: "test-key",
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

type FakeCall = { url: string; method: string; headers: Record<string, string>; body: unknown };

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** 依次返回给定响应的假 fetch，并记录每次调用的 URL/头/请求体。 */
function sequentialFetch(responses: Response[]) {
  const calls: FakeCall[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const template = responses[Math.min(calls.length, responses.length - 1)];
    calls.push({
      url,
      method: String(init?.method || "GET"),
      headers: (init?.headers || {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return template.clone();
  });
  return { fetchMock, calls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("kie-job protocol adapter", () => {
  it("uses the plain base URL and the documented job paths", async () => {
    const adapterConfig: AiDeploymentAdapterConfig = {};
    const { fetchMock, calls } = sequentialFetch([
      jsonResponse({ code: 200, msg: "success", data: { taskId: "task-1" } }),
      jsonResponse({ code: 200, msg: "success", data: { taskId: "task-1", state: "success", resultJson: '{"resultUrls":["https://cdn.example.com/a.png"]}' } }),
    ]);

    const result = await generateImageWithKieJob({
      deployment: kieDeployment(adapterConfig),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "a red cup",
      aspectRatio: "1:1",
      imageSize: "1K",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    expect(result).toEqual({ taskId: "task-1", urls: ["https://cdn.example.com/a.png"] });
    expect(calls[0].url).toBe("https://api.kie.ai" + KIE_JOB_CREATE_TASK_PATH);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers).toMatchObject({ Authorization: "Bearer test-key", "Content-Type": "application/json" });
    expect(calls[0].body).toEqual({ model: "nano-banana-2", input: { prompt: "a red cup", aspect_ratio: "1:1", resolution: "1K" } });
    expect(calls[1].url).toBe("https://api.kie.ai" + KIE_JOB_RECORD_INFO_PATH + "?taskId=task-1");
    expect(calls[1].method).toBe("GET");
  });

  it("does not append a duplicate taskId query when the status path carries the placeholder", async () => {
    const { fetchMock, calls } = sequentialFetch([
      jsonResponse({ code: 200, data: { taskId: "task-77" } }),
      jsonResponse({ code: 200, data: { taskId: "task-77", state: "success", resultJson: '{"resultUrls":["https://cdn.example.com/a.png"]}' } }),
    ]);

    await generateImageWithKieJob({
      deployment: kieDeployment({ statusPath: "/api/v1/jobs/recordInfo/{taskId}" }),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "a red cup",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    expect(calls[1].url).toBe("https://api.kie.ai/api/v1/jobs/recordInfo/task-77");
  });

  it("switches to another upstream model id only when input images are present", () => {
    const adapterConfig: AiDeploymentAdapterConfig = {
      editUpstreamModel: "gpt-image-2-image-to-image",
      imageInputField: "input_urls",
    };

    expect(resolveKieUpstreamModel({ upstreamModel: "gpt-image-2-text-to-image", imageCount: 0, adapterConfig }))
      .toBe("gpt-image-2-text-to-image");
    expect(resolveKieUpstreamModel({ upstreamModel: "gpt-image-2-text-to-image", imageCount: 2, adapterConfig }))
      .toBe("gpt-image-2-image-to-image");
    // 没有声明 editUpstreamModel 时保持部署绑定的上游模型。
    expect(resolveKieUpstreamModel({ upstreamModel: "nano-banana-2", imageCount: 1 })).toBe("nano-banana-2");

    const textOnly = buildKieCreateTaskBody({
      upstreamModel: "gpt-image-2-text-to-image",
      prompt: "draw a cat",
      aspectRatio: "3:4",
      imageSize: "2K",
      adapterConfig,
    });
    expect(textOnly).toEqual({
      model: "gpt-image-2-text-to-image",
      input: { prompt: "draw a cat", aspect_ratio: "3:4", resolution: "2K" },
    });

    const withImages = buildKieCreateTaskBody({
      upstreamModel: "gpt-image-2-text-to-image",
      prompt: "swap the shirt",
      imageUrls: ["https://cdn.example.com/source.png", "https://cdn.example.com/source.png"],
      aspectRatio: "3:4",
      imageSize: "2K",
      adapterConfig,
    });
    expect(withImages).toEqual({
      model: "gpt-image-2-image-to-image",
      input: {
        prompt: "swap the shirt",
        input_urls: ["https://cdn.example.com/source.png"],
        aspect_ratio: "3:4",
        resolution: "2K",
      },
    });
  });

  it("keeps per-model image field names and can omit the size field", () => {
    expect(resolveKieImageInputField()).toBe("image_input");
    expect(resolveKieImageInputField({ imageInputField: "image_urls" })).toBe("image_urls");
    expect(resolveKieImageSizeField()).toBe("resolution");
    expect(resolveKieImageSizeField({ imageSizeField: "none" })).toBe("");

    const lite = buildKieCreateTaskBody({
      upstreamModel: "nano-banana-2-lite",
      prompt: "draw a cat",
      imageUrls: ["https://cdn.example.com/source.png"],
      aspectRatio: "auto",
      imageSize: "1K",
      adapterConfig: { imageInputField: "image_urls", imageSizeField: "none" },
    });
    expect(lite).toEqual({
      model: "nano-banana-2-lite",
      input: { prompt: "draw a cat", image_urls: ["https://cdn.example.com/source.png"], aspect_ratio: "auto" },
    });

    const staticParams = buildKieCreateTaskBody({
      upstreamModel: "nano-banana-2",
      prompt: "user prompt wins",
      aspectRatio: "1:1",
      adapterConfig: { staticParameters: { prompt: "deployment prompt", output_format: "png" } },
    });
    expect(staticParams.input).toEqual({ prompt: "user prompt wins", aspect_ratio: "1:1", output_format: "png" });
  });

  it("rejects inline or local reference images before calling kie", () => {
    expect(() => buildKieCreateTaskBody({
      upstreamModel: "nano-banana-2",
      prompt: "inline",
      imageUrls: ["data:image/png;base64,aGVsbG8="],
    })).toThrowError(NonRetryableGenerationError);
    expect(() => buildKieCreateTaskBody({
      upstreamModel: "nano-banana-2",
      prompt: "inline",
      imageUrls: ["data:image/png;base64,aGVsbG8="],
    })).toThrowError(/公网访问/);
  });

  it("forwards bearer auth and an optional idempotency key", () => {
    expect(buildKieJobHeaders({ apiKey: "k" })).toEqual({
      Authorization: "Bearer k",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(buildKieJobHeaders({ apiKey: "k", idempotencyKey: "gen-image:1" })).toMatchObject({
      "Idempotency-Key": "gen-image:1",
    });
  });

  it("parses createTask responses and maps envelope failures", () => {
    expect(parseKieCreateTaskResponse({ code: 200, msg: "success", data: { taskId: "dc1928bf" } }))
      .toEqual({ taskId: "dc1928bf" });

    // 缺少 taskId 的 2xx 响应是模糊的：绝不能进入可重放的重试路径。
    expect(() => parseKieCreateTaskResponse({ code: 200, msg: "success", data: {} }))
      .toThrowError(NonRetryableGenerationError);
    try {
      parseKieCreateTaskResponse({ code: 200, msg: "success", data: {} });
    } catch (error) {
      expect((error as NonRetryableGenerationError).code).toBe("KIE_JOB_AMBIGUOUS_RESPONSE");
      expect((error as NonRetryableGenerationError).message).toContain("top=code,msg,data");
    }

    // 401/402/429 证明请求未被接受，可以安全切换部署。
    try {
      parseKieCreateTaskResponse({ code: 401, msg: "Unauthorized" });
      throw new Error("expected a typed error");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderHttpResponseError);
      expect(error).toMatchObject({ status: 401, safeToFailover: true, code: "KIE_JOB_ENVELOPE_401" });
    }

    // 422 是参数校验失败：不重试、不切换。
    expect(() => parseKieCreateTaskResponse({ code: 422, msg: "Validation Error" }))
      .toThrowError(NonRetryableGenerationError);
    // 500/455 是上游瞬时故障：可重试。
    expect(createKieEnvelopeError(500, "Server Error")).toBeInstanceOf(RetryableGenerationError);
    expect(createKieEnvelopeError(455, "Service Unavailable")).toBeInstanceOf(RetryableGenerationError);
  });

  it("extracts result URLs from the resultJson string", () => {
    expect(readKieResultUrls({
      resultJson: '{"resultUrls":["https://cdn.example.com/a.png","https://cdn.example.com/b.png"]}',
    })).toEqual(["https://cdn.example.com/a.png", "https://cdn.example.com/b.png"]);
    // 有些响应直接把 resultJson 摊平成对象。
    expect(readKieResultUrls({ resultJson: { resultUrls: ["https://cdn.example.com/a.png"] } }))
      .toEqual(["https://cdn.example.com/a.png"]);
    expect(readKieResultUrls({ resultJson: "not-json" })).toEqual([]);
    expect(readKieResultUrls({ resultJson: '{"resultObject":{"subject_status":1}}' })).toEqual([]);
  });

  it("parses recordInfo success and failure states", () => {
    const success = parseKieRecordInfoResponse({
      code: 200,
      msg: "success",
      data: {
        taskId: "task-9",
        state: "success",
        resultJson: '{"resultUrls":["https://cdn.example.com/out.jpg"]}',
      },
    }, "fallback");
    expect(success).toEqual({
      taskId: "task-9",
      state: "success",
      status: "completed",
      urls: ["https://cdn.example.com/out.jpg"],
    });

    // 状态成功但结果还没生成：交给调用方在宽限期内继续轮询。
    const pending = parseKieRecordInfoResponse({
      code: 200,
      data: { taskId: "task-9", state: "success", resultJson: "" },
    }, "fallback");
    expect(pending.status).toBe("running");
    expect(pending.urls).toEqual([]);

    const failed = parseKieRecordInfoResponse({
      code: 200,
      data: { taskId: "task-9", state: "fail", failCode: "500", failMsg: "content policy violated" },
    }, "fallback");
    expect(failed).toEqual({
      taskId: "task-9",
      state: "fail",
      status: "failed",
      urls: [],
      error: "content policy violated（failCode=500）",
    });

    expect(parseKieRecordInfoResponse({ code: 200, data: { taskId: "task-9", state: "generating" } }, "task-9"))
      .toMatchObject({ status: "running" });
    expect(parseKieRecordInfoResponse({ code: 200, data: { taskId: "task-9", state: "queuing" } }, "task-9"))
      .toMatchObject({ status: "queued" });
  });

  it("fails the query with a typed error when the payload carries no state", () => {
    try {
      parseKieRecordInfoResponse({ code: 429, msg: "Request Restricted" }, "task-1");
      throw new Error("expected a typed error");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderHttpResponseError);
      expect(error).toMatchObject({ status: 429, safeToFailover: true });
    }
    expect(() => parseKieRecordInfoResponse({ code: 200, data: {} }, "task-1"))
      .toThrowError(/缺少任务状态/);
    expect(describeKieResponseKeys({ code: 200, data: {} })).toBe("top=code,data");
  });

  it("polls until the task produces a URL and reports progress", async () => {
    const responses = [
      jsonResponse({ code: 200, msg: "success", data: { taskId: "task-42" } }),
      jsonResponse({ code: 200, data: { taskId: "task-42", state: "waiting" } }),
      jsonResponse({ code: 200, data: { taskId: "task-42", state: "generating" } }),
      jsonResponse({ code: 200, data: { taskId: "task-42", state: "success", resultJson: "{\"resultUrls\":[\"https://cdn.example.com/final.png\"]}" } }),
    ];
    const { fetchMock, calls } = sequentialFetch(responses);
    const progress: Array<{ status: string; progress: number; taskId?: string }> = [];

    const result = await generateImageWithKieJob({
      deployment: kieDeployment({ editUpstreamModel: "nano-banana-2-edit", imageInputField: "image_input" }),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "make it premium",
      imageUrls: ["https://cdn.example.com/source.png"],
      aspectRatio: "3:4",
      imageSize: "2K",
      onProgress: (update) => { progress.push({ status: update.status, progress: update.progress, taskId: update.taskId }); },
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    expect(result).toEqual({ taskId: "task-42", urls: ["https://cdn.example.com/final.png"] });
    expect(calls).toHaveLength(4);
    expect(calls[0].body).toEqual({
      model: "nano-banana-2-edit",
      input: { prompt: "make it premium", image_input: ["https://cdn.example.com/source.png"], aspect_ratio: "3:4", resolution: "2K" },
    });
    expect(progress[0]).toMatchObject({ status: "queued", progress: 1 });
    expect(progress.at(-1)).toMatchObject({ status: "completed", progress: 100, taskId: "task-42" });
  });

  it("surfaces a failed task as a structured non-retryable error", async () => {
    vi.stubEnv("KIE_JOB_POLL_INTERVAL_MS", "1000");
    const { fetchMock } = sequentialFetch([
      jsonResponse({ code: 200, data: { taskId: "task-7" } }),
      jsonResponse({
        code: 200,
        data: { taskId: "task-7", state: "fail", failMsg: "Generation failed: prompt rejected", failCode: "501" },
      }),
    ]);

    await expect(generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "blocked prompt",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => {},
    })).rejects.toMatchObject({
      name: "NonRetryableGenerationError",
      code: "KIE_JOB_TASK_FAILED",
      message: expect.stringContaining("prompt rejected"),
    });
  });

  it("maps submit-time HTTP rejections onto the shared provider error type", async () => {
    const { fetchMock } = sequentialFetch([
      jsonResponse({ code: 401, msg: "Unauthorized" }, 401, { "x-request-id": "kie-trace-1" }),
    ]);

    await expect(generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: "bad-key",
      prompt: "a red cup",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => {},
    })).rejects.toMatchObject({
      name: "ProviderHttpResponseError",
      status: 401,
      code: "KIE_JOB_401",
      providerRequestId: "kie-trace-1",
      safeToFailover: true,
    });
  });

  it("times out without ever re-submitting the task", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.stubEnv("KIE_JOB_TIMEOUT_MS", "30000");
    vi.stubEnv("KIE_JOB_POLL_INTERVAL_MS", "1000");
    const { fetchMock, calls } = sequentialFetch([
      jsonResponse({ code: 200, data: { taskId: "task-slow" } }),
      jsonResponse({ code: 200, data: { taskId: "task-slow", state: "generating" } }),
    ]);

    await expect(generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "slow task",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => { await vi.advanceTimersByTimeAsync(20_000); },
    })).rejects.toMatchObject({ code: "KIE_JOB_TIMEOUT" });

    // 只有一次提交，随后都是 recordInfo 查询。
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "GET").length).toBeGreaterThan(0);
  });

  it("reports a success state whose result URL never arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.stubEnv("KIE_JOB_TIMEOUT_MS", "30000");
    vi.stubEnv("KIE_JOB_RESULT_GRACE_MS", "10000");
    const { fetchMock } = sequentialFetch([
      jsonResponse({ code: 200, data: { taskId: "task-empty" } }),
      jsonResponse({ code: 200, data: { taskId: "task-empty", state: "success" } }),
    ]);

    await expect(generateImageWithKieJob({
      deployment: kieDeployment(),
      apiBase: "https://api.kie.ai",
      apiKey: "test-key",
      prompt: "empty result",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async () => { await vi.advanceTimersByTimeAsync(11_000); },
    })).rejects.toMatchObject({ code: "KIE_JOB_RESULT_MISSING" });
  });
});
