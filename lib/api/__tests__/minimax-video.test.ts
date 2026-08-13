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
  apiBase: "https://api.new.bi",
  apiKey: "test-minimax-video-key",
  model: "minimax-h3",
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

describe("minimax video adapter (new-api gateway)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("submits image-to-video to /v1/video/generations and polls until completed", async () => {
    const requests: Array<{ method: string; url: string; body?: Record<string, unknown> }> = [];
    let pollCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      const url = String(input);
      const rawBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : undefined;
      requests.push({ method, url, body: rawBody });

      if (method === "POST") {
        return jsonResponse({ id: "task_1", task_id: "task_1", object: "video", model: "minimax-h3", status: "queued", progress: 0 });
      }
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({ code: "success", data: { status: "IN_PROGRESS", progress: "40%", data: { data: { data: { object: "video", status: "in_progress", progress: 40, video_url: null } } } } });
      }
      return jsonResponse({ code: "success", data: { status: "SUCCESS", progress: "100%", data: { data: { data: { object: "video", status: "completed", progress: 100, video_url: "https://cdn.example.com/result.mp4" } } } } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onProgress = vi.fn();
    const pending = generateMinimaxImageToVideo({ ...minimaxInput(), onProgress }, provider);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await pending;

    const post = requests.find((item) => item.method === "POST");
    const gets = requests.filter((item) => item.method === "GET");

    expect(post?.url).toBe("https://api.new.bi/v1/video/generations");
    expect(post?.body).toMatchObject({ model: "minimax-h3", duration: 5 });
    expect(post?.body?.image).toBe("https://cdn.example.com/model.png");
    expect(gets[0]?.url).toBe("https://api.new.bi/v1/video/generations/task_1");
    expect(result).toMatchObject({ taskId: "task_1", url: "https://cdn.example.com/result.mp4", providerStatus: "completed" });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "running" }));
  });

  it("selects the 768p model for 720p resolution", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST") {
        return jsonResponse({ id: "task_2", task_id: "task_2", object: "video", model: "minimax-h3-768p", status: "queued" });
      }
      return jsonResponse({ code: "success", data: { status: "SUCCESS", progress: "100%", data: { data: { data: { object: "video", status: "completed", progress: 100, video_url: "https://cdn.example.com/r.mp4" } } } } });
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
    const body = JSON.parse(String(post.body)) as { model: string; reference_image: string };
    expect(body.model).toBe("minimax-h3-768p");
    expect(body.reference_image).toBe("https://cdn.example.com/model.png");
    expect(body).not.toHaveProperty("metadata");
  });

  it("passes the first and last frames as top-level fields", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method || "GET").toUpperCase();
      if (method === "POST") {
        return jsonResponse({ id: "task_3", task_id: "task_3", object: "video", model: "minimax-h3", status: "queued" });
      }
      return jsonResponse({ code: "success", data: { status: "SUCCESS", progress: "100%", data: { data: { data: { object: "video", status: "completed", progress: 100, video_url: "https://cdn.example.com/frame.mp4" } } } } });
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
    const body = JSON.parse(String(post.body)) as { model: string; first_frame_image: string; last_frame_image: string; duration: number };
    expect(body.first_frame_image).toBe("https://cdn.example.com/first.png");
    expect(body.last_frame_image).toBe("https://cdn.example.com/last.png");
    expect(body).not.toHaveProperty("image");
    expect(body).not.toHaveProperty("metadata");
    expect(body.duration).toBe(5);
  });
});
