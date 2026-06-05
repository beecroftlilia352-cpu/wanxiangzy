import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateSeedanceImageToVideo } from "@/lib/api/seedance-video";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function seedanceInput() {
  return {
    imageUrl: "https://cdn.example.com/model-grid.png",
    prompt: "模特双手自然插入口袋，展示服装整体廓形与线条。",
    modelMode: "pro" as const,
    duration: 4 as const,
    resolution: "720p" as const,
    aspectRatio: "9:16" as const,
    audioMode: "off" as const,
    generateAudio: false,
  };
}

describe("seedance video", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env = {
      ...ORIGINAL_ENV,
      LAOZHANG_SEEDANCE_API_KEY: "test-seedance-key",
      LAOZHANG_SEEDANCE_BASE_URL: "https://seedance.test/seedance/api/v3",
      LAOZHANG_SEEDANCE_PRO_MODEL: "doubao-seedance-2-0-260128",
      LAOZHANG_SEEDANCE_FAST_MODEL: "doubao-seedance-2-0-fast-260128",
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("keeps polling when the provider reports terminated before the final successful task detail", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });

      if (method === "POST") {
        return jsonResponse({
          id: "cgt-20260606031519-xwgp9",
          request_id: "req-submit-1",
          status: "submitted",
        });
      }

      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({
          id: "cgt-20260606031519-xwgp9",
          request_id: "req-poll-1",
          status: "terminated",
          message: "terminated",
        });
      }

      return jsonResponse({
        id: "cgt-20260606031519-xwgp9",
        task_id: "cgt-20260606031519-xwgp9",
        request_id: "req-final-1",
        status: "completed",
        data: {
          status: "succeeded",
          content: {
            last_frame_url: "https://ark.example.com/last-frame.png",
            video_url: "https://ark.example.com/result.mp4",
          },
        },
        result_url: "https://ark.example.com/result.mp4",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const pending = generateSeedanceImageToVideo({ ...seedanceInput(), onProgress });

    await vi.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    const postRequests = requests.filter((item) => item.method === "POST");
    const getRequests = requests.filter((item) => item.method === "GET");

    expect(postRequests).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://seedance.test/seedance/api/v3/contents/generations/tasks",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Accept-Encoding": "identity",
        }),
      })
    );
    expect(getRequests).toHaveLength(2);
    expect(result).toMatchObject({
      taskId: "cgt-20260606031519-xwgp9",
      requestId: "req-final-1",
      url: "https://ark.example.com/result.mp4",
      providerStatus: "completed",
    });
    expect(result.urls).toEqual(["https://ark.example.com/result.mp4"]);
    expect(result.providerDetails?.finalResponse).toBeTruthy();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      providerStatus: "terminated",
      status: "running",
    }));
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

    await expect(generateSeedanceImageToVideo(seedanceInput())).rejects.toThrow("InputImageSensitiveContentDetected");

    expect(requests.filter((item) => item.method === "POST")).toHaveLength(1);
    expect(requests[0]?.body?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url", role: "reference_image" }),
      ])
    );
  });
});
