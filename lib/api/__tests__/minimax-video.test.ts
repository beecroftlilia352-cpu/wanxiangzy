import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateMinimaxFirstLastFrame,
  generateMinimaxImageToVideo,
  generateMinimaxMotionControl,
} from "@/lib/api/minimax-video";

const ORIGINAL_ENV = { ...process.env };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const provider = {
  apiBase: "https://api.minimaxi.com",
  apiKey: "test-minimax-video-key",
  model: "MiniMax-H3",
};

function minimaxInput() {
  return {
    imageUrl: "https://cdn.example.com/model.png",
    prompt: "模特自然走动展示服装。",
    modelMode: "pro" as const,
    duration: 5 as const,
    resolution: "1080p" as const,
    aspectRatio: "9:16" as const,
    audioMode: "off" as const,
    generateAudio: false,
  };
}

describe("minimax video adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("submits image-to-video with first_frame role and polls /v2/query/video_generation", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });

      if (method === "POST") {
        return jsonResponse({ task_id: "424010985738629" });
      }
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({ task: { id: "424010985738629", status: "Processing" } });
      }
      return jsonResponse({
        task: {
          id: "424010985738629",
          status: "succeeded",
          content: { url: "https://cdn.example.com/result.mp4" },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const pending = generateMinimaxImageToVideo({ ...minimaxInput(), onProgress }, provider);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    const post = requests.find((item) => item.method === "POST");
    const gets = requests.filter((item) => item.method === "GET");

    expect(post?.url).toBe("https://api.minimaxi.com/v2/video_generation");
    expect(post?.body).toMatchObject({
      model: "MiniMax-H3",
      duration: 5,
      resolution: "2K",
    });
    expect(post?.body?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url", role: "first_frame" }),
      ])
    );
    expect(gets[0]?.url).toBe("https://api.minimaxi.com/v2/query/video_generation/424010985738629");
    expect(result).toMatchObject({
      taskId: "424010985738629",
      url: "https://cdn.example.com/result.mp4",
      providerStatus: "succeeded",
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
  });

  it("maps motion control to reference_video + reference_image roles", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST") {
        return jsonResponse({ task_id: "motion-1" });
      }
      return jsonResponse({ task: { id: "motion-1", status: "succeeded", content: { url: "https://cdn.example.com/motion.mp4" } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateMinimaxMotionControl({
      modelImageUrl: "https://cdn.example.com/model.png",
      referenceVideoUrl: "https://cdn.example.com/reference.mp4",
      prompt: "",
      modelMode: "pro",
      duration: 5,
      resolution: "720p",
      aspectRatio: "auto",
      audioMode: "off",
      generateAudio: false,
    }, provider);

    await vi.advanceTimersByTimeAsync(20_000);
    await pending;

    const post = (fetchMock.mock.calls[0]?.[1] as RequestInit);
    const body = JSON.parse(String(post.body)) as { content: Array<{ type: string; role?: string }>; duration: number; resolution: string };
    expect(body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "video_url", role: "reference_video" }),
        expect.objectContaining({ type: "image_url", role: "reference_image" }),
      ])
    );
    expect(body.resolution).toBe("768P");
  });

  it("maps first-last-frame to first_frame + last_frame roles", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST") {
        return jsonResponse({ task_id: "frame-1" });
      }
      return jsonResponse({ task: { id: "frame-1", status: "succeeded", content: { url: "https://cdn.example.com/frame.mp4" } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = generateMinimaxFirstLastFrame({
      firstFrameUrl: "https://cdn.example.com/first.png",
      lastFrameUrl: "https://cdn.example.com/last.png",
      prompt: "自然过渡",
      modelMode: "fast",
      duration: 3,
      resolution: "720p",
      aspectRatio: "1:1",
      audioMode: "generated",
      generateAudio: true,
    }, provider);

    await vi.advanceTimersByTimeAsync(20_000);
    await pending;

    const post = (fetchMock.mock.calls[0]?.[1] as RequestInit);
    const body = JSON.parse(String(post.body)) as { content: Array<{ type: string; role?: string }>; duration: number; resolution: string };
    expect(body.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url", role: "first_frame" }),
        expect.objectContaining({ type: "image_url", role: "last_frame" }),
      ])
    );
    expect(body.resolution).toBe("768P");
    expect(body.duration).toBe(4);
  });
});
