import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateHappyHorseImageToVideo, generateHappyHorseMotionControl } from "@/lib/api/happyhorse-video";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function happyHorseInput() {
  return {
    imageUrl: "https://cdn.example.com/model-grid.png",
    prompt: "模特双手自然插入口袋，展示服装整体廓形与线条。",
    modelMode: "pro" as const,
    duration: 5 as const,
    resolution: "720p" as const,
    aspectRatio: "9:16" as const,
    audioMode: "off" as const,
    generateAudio: false,
  };
}

describe("happyhorse video", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env = {
      ...ORIGINAL_ENV,
      HAPPYHORSE_API_KEY: "test-happyhorse-key",
      HAPPYHORSE_BASE_URL: "https://yunwu.test/v1",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("submits image-to-video tasks to the documented HappyHorse endpoint and polls until success", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });

      if (method === "POST") {
        return jsonResponse({
          request_id: "req-submit-1",
          output: {
            task_id: "hh-20260606031519-xwgp9",
            task_status: "PENDING",
          },
        });
      }

      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({
          request_id: "req-poll-1",
          output: {
            task_id: "hh-20260606031519-xwgp9",
            task_status: "RUNNING",
          },
        });
      }

      return jsonResponse({
        request_id: "req-final-1",
        output: {
          task_id: "hh-20260606031519-xwgp9",
          task_status: "SUCCEEDED",
          video_url: "https://dashscope.example.com/result.mp4",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const pending = generateHappyHorseImageToVideo({ ...happyHorseInput(), onProgress });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    const postRequests = requests.filter((item) => item.method === "POST");
    const getRequests = requests.filter((item) => item.method === "GET");

    expect(postRequests).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://yunwu.test/alibailian/api/v1/services/aigc/video-generation/video-synthesis",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Encoding": "identity",
        }),
      })
    );
    expect(getRequests).toHaveLength(2);
    expect(getRequests[0]?.url).toBe("https://yunwu.test/alibailian/api/v1/tasks/hh-20260606031519-xwgp9");
    expect(postRequests[0]?.body).toMatchObject({
      model: "happyhorse-1.0-i2v",
      input: {
        media: [{ type: "first_frame", url: "https://cdn.example.com/model-grid.png" }],
      },
      parameters: {
        resolution: "720P",
        duration: 5,
        watermark: false,
      },
    });
    expect((postRequests[0]?.body?.input as { prompt?: string })?.prompt).toContain("生成静音视频");
    expect((postRequests[0]?.body?.input as { prompt?: string })?.prompt).toContain("9:16");
    expect((postRequests[0]?.body?.input as { prompt?: string })?.prompt).toContain("不添加黑边");
    expect(result).toMatchObject({
      taskId: "hh-20260606031519-xwgp9",
      requestId: "req-final-1",
      url: "https://dashscope.example.com/result.mp4",
      providerStatus: "SUCCEEDED",
    });
    expect(result.urls).toEqual(["https://dashscope.example.com/result.mp4"]);
    expect(result.providerDetails?.finalResponse).toBeTruthy();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      providerStatus: "RUNNING",
      status: "running",
    }));
  });

  it("does not preserve source video audio when motion control audio is off", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url: String(input), body: rawBody });

      if (method === "POST") {
        return jsonResponse({
          request_id: "req-submit-2",
          output: { task_id: "hh-motion-1", task_status: "PENDING" },
        });
      }

      return jsonResponse({
        request_id: "req-final-2",
        output: {
          task_id: "hh-motion-1",
          task_status: "SUCCEEDED",
          video_url: "https://dashscope.example.com/motion.mp4",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateHappyHorseMotionControl({
      modelImageUrl: "https://cdn.example.com/model.png",
      referenceVideoUrl: "https://cdn.example.com/reference.mp4",
      prompt: "",
      modelMode: "pro",
      duration: 5,
      resolution: "720p",
      aspectRatio: "9:16",
      audioMode: "off",
      generateAudio: false,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await pending;

    const postBody = requests.find((item) => item.method === "POST")?.body;
    expect(postBody).toMatchObject({
      model: "happyhorse-1.0-video-edit",
      parameters: {
        resolution: "720P",
        watermark: false,
      },
    });
    expect((postBody?.parameters as Record<string, unknown>)?.audio_setting).toBeUndefined();
    expect((postBody?.input as { prompt?: string })?.prompt).toContain("生成静音视频");
  });

  it("does not submit a text-only fallback when the provider rejects an image for real-person privacy", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });
      return jsonResponse({
        error: {
          code: "InputImageSensitiveContentDetected.PrivacyInformation",
          message: "The request failed because the input image may contain real person.",
          type: "invalid_request_error",
        },
      }, 400);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateHappyHorseImageToVideo(happyHorseInput())).rejects.toThrow("InputImageSensitiveContentDetected");

    expect(requests.filter((item) => item.method === "POST")).toHaveLength(1);
    expect((requests[0]?.body?.input as { media?: unknown[] })?.media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "first_frame", url: "https://cdn.example.com/model-grid.png" }),
      ])
    );
  });
});
