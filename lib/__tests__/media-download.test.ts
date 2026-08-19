import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMediaFile, downloadMediaFiles, fetchMediaBlob } from "@/lib/media-download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("downloadMediaFile", () => {
  it("hands remote media to the native browser download without buffering bytes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let clickedHref = "";
    let clickedFilename = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedFilename = this.download;
    });
    const progress: string[] = [];

    await downloadMediaFile("https://oss.example.com/result.png", "result.png", {
      onProgress: (state) => progress.push(state.phase),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const downloadUrl = new URL(clickedHref);
    expect(downloadUrl.pathname).toBe("/api/download-image");
    expect(downloadUrl.searchParams.get("url")).toBe("https://oss.example.com/result.png");
    expect(downloadUrl.searchParams.get("filename")).toBe("result.png");
    expect(downloadUrl.searchParams.get("proxy")).toBe("1");
    expect(clickedFilename).toBe("result.png");
    expect(progress).toEqual(["saving", "completed"]);
  });

  it("keeps byte progress for callers that need readable media blobs", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "image/png", "content-length": "4" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<{ phase: string; percent: number | null }> = [];

    const blob = await fetchMediaBlob("https://provider.example.com/result.png", "result.png", {
      forceProxy: true,
      onProgress: ({ phase, percent }) => progress.push({ phase, percent }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("proxy=1");
    expect(blob.size).toBe(4);
    expect(progress.some((state) => state.phase === "downloading" && state.percent === 100)).toBe(true);
  });

  it("downloads local blob URLs directly as well", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let clickedHref = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
    });

    await downloadMediaFile("blob:local-result", "local.png");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickedHref).toBe("blob:local-result");
  });

  it("routes canonical media assets through the authenticated download proxy", async () => {
    let clickedHref = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
    });

    await downloadMediaFile(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
      "result.png",
    );

    const downloadUrl = new URL(clickedHref);
    expect(downloadUrl.pathname).toBe("/api/download-image");
    expect(downloadUrl.searchParams.get("url")).toBe(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
    );
    expect(downloadUrl.searchParams.get("proxy")).toBe("1");
  });

  it("hands every result directly to the browser with distinct filenames", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const downloads: Array<{ href: string; filename: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });

    const result = await downloadMediaFiles({
      urls: [
        "https://oss.example.com/first.webp",
        "https://oss.example.com/second.jpg?version=2",
      ],
      filenamePrefix: "tryon-results",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 2, failedCount: 0 });
    expect(downloads.map((item) => item.filename)).toEqual([
      "tryon-results-01.webp",
      "tryon-results-02.jpg",
    ]);
    expect(downloads.every((item) => new URL(item.href).pathname === "/api/download-image")).toBe(true);
  });
});
