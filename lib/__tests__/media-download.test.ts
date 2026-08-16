import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMediaFile } from "@/lib/media-download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadMediaFile", () => {
  it("resolves OSS media to a direct attachment URL without proxying bytes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      strategy: "direct",
      url: "https://oss.example.com/signed-result.png",
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const progress: string[] = [];

    await downloadMediaFile("https://oss.example.com/result.png", "result.png", {
      onProgress: (state) => progress.push(state.phase),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("resolve=1");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(progress).toEqual(["resolving", "saving", "completed"]);
  });

  it("streams proxied media and reports byte progress before saving", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        strategy: "proxy",
        url: "/api/download-image?proxy=1",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "4" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const NativeURL = URL;
    class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => "blob:download");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", MockURL);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const progress: Array<{ phase: string; percent: number | null }> = [];

    await downloadMediaFile("https://provider.example.com/result.png", "result.png", {
      onProgress: ({ phase, percent }) => progress.push({ phase, percent }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress.some((state) => state.phase === "downloading" && state.percent === 100)).toBe(true);
    expect(progress.at(-1)).toEqual({ phase: "completed", percent: 100 });
  });

  it("falls back to the guarded proxy when target resolution is interrupted", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2]), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "2" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    const NativeURL = URL;
    class MockURL extends NativeURL {
      static createObjectURL = vi.fn(() => "blob:download");
      static revokeObjectURL = vi.fn();
    }
    vi.stubGlobal("URL", MockURL);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await expect(downloadMediaFile(
      "https://provider.example.com/result.png",
      "result.png",
    )).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("proxy=1");
  });
});
