import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateSeedanceImageToVideo } from "@/lib/api/seedance-video";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

  it("falls back to text-only generation when an image submit is rejected for real-person privacy", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });

      if (method === "POST" && requests.filter((item) => item.method === "POST").length === 1) {
        return jsonResponse({
          error: {
            code: "InputImageSensitiveContentDetected.PrivacyInformation",
            message: "The request failed because the input image may contain real person.",
            type: "invalid_request_error",
          },
        }, 400);
      }

      if (method === "POST") {
        return jsonResponse({ id: "task-text-fallback", status: "submitted" });
      }

      return jsonResponse({
        id: "task-text-fallback",
        status: "succeeded",
        output: [{ url: "https://cdn.example.com/video.mp4" }],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const pending = generateSeedanceImageToVideo({
      imageUrl: "https://cdn.example.com/real-person.png",
      prompt: "模特双手自然插入口袋，展示服装整体廓形与线条。",
      modelMode: "pro",
      duration: 4,
      resolution: "720p",
      aspectRatio: "9:16",
      audioMode: "off",
      generateAudio: false,
      onProgress,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;
    const postRequests = requests.filter((item) => item.method === "POST");

    expect(result).toMatchObject({
      taskId: "task-text-fallback",
      url: "https://cdn.example.com/video.mp4",
      providerStatus: "succeeded",
    });
    expect(postRequests).toHaveLength(2);
    expect(postRequests[0]?.body?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url", role: "reference_image" }),
      ])
    );
    expect(postRequests[1]?.body).toMatchObject({
      model: "doubao-seedance-2-0-260128",
      ratio: "9:16",
      duration: 4,
      resolution: "720p",
      generate_audio: false,
    });
    expect(postRequests[1]?.body?.content).toEqual([
      expect.objectContaining({ type: "text" }),
    ]);
    expect(JSON.stringify(postRequests[1]?.body)).not.toContain("image_url");
    expect(result.compiledPrompt).not.toContain("image_url");
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      providerStatus: "IMAGE_PRIVACY_TEXT_FALLBACK",
    }));
  });
});
