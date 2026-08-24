import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMediaFile, downloadMediaFiles, prepareMediaDownloads } from "@/lib/media-download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadMediaFile", () => {
  it("hands public OSS objects directly to the browser", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let clickedHref = "";
    let clickedFilename = "";
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedFilename = this.download;
    });
    const progress: string[] = [];

    await downloadMediaFile("https://vasthk.oss-cn-hongkong.aliyuncs.com/results/result.png", "result.png", {
      onProgress: (state) => progress.push(state.phase),
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(clickedHref).toBe("https://vasthk.oss-cn-hongkong.aliyuncs.com/results/result.png");
    expect(clickedFilename).toBe("result.png");
    expect(progress).toEqual(["saving", "completed"]);
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

  it("uses the canonical asset MIME to correct a misleading png download name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      strategy: "direct",
      url: "https://oss.example.com/result-object?signed=1",
      filename: "result.jpg",
      mime_type: "image/jpeg",
    }));
    vi.stubGlobal("fetch", fetchMock);
    let clickedHref = "";
    let clickedFilename = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
      clickedFilename = this.download;
    });

    await downloadMediaFile(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
      "result.png",
    );

    expect(clickedHref).toBe("https://oss.example.com/result-object?signed=1");
    expect(clickedFilename).toBe("result.jpg");
    const resolveUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(resolveUrl.pathname).toBe(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
    );
    expect(resolveUrl.searchParams.get("filename")).toBe("result.png");
    expect(resolveUrl.searchParams.get("resolve")).toBe("1");
  });

  it("hands every prepared OSS result to the browser as an individual download", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    const downloads: Array<{ href: string; filename: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });

    const downloadPromise = downloadMediaFiles({
      urls: [
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp",
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.jpg?version=2",
      ],
      filenamePrefix: "tryon-results",
      preparedDownloads: [
        { url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp?signed=1", filename: "tryon-01.webp" },
        { url: "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.jpg?signed=1", filename: "tryon-02.jpg" },
      ],
    });

    expect(downloads).toEqual([
      { href: "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp?signed=1", filename: "tryon-01.webp" },
    ]);
    await vi.advanceTimersByTimeAsync(500);
    const result = await downloadPromise;
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 2, failedCount: 0 });
    expect(downloads).toEqual([
      { href: "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp?signed=1", filename: "tryon-01.webp" },
      { href: "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.jpg?signed=1", filename: "tryon-02.jpg" },
    ]);
  });

  it("resolves canonical media to signed direct URLs without proxying image bytes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ strategy: "direct", url: "https://oss.example.com/one.jpg?signed=1", filename: "results-01.jpg" }))
      .mockResolvedValueOnce(Response.json({ strategy: "direct", url: "https://oss.example.com/two.webp?signed=1", filename: "results-02.webp" }));
    vi.stubGlobal("fetch", fetchMock);

    const prepared = await prepareMediaDownloads({
      urls: [
        "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
        "/api/media-assets/223e4567-e89b-12d3-a456-426614174000",
      ],
      filenamePrefix: "results",
    });

    expect(prepared.map((item) => item.url)).toEqual([
      "https://oss.example.com/one.jpg?signed=1",
      "https://oss.example.com/two.webp?signed=1",
    ]);
    expect(prepared.map((item) => item.filename)).toEqual(["results-01.jpg", "results-02.webp"]);
    const resolveUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(resolveUrls.every((value) => value.includes("/api/media-assets/"))).toBe(true);
    expect(resolveUrls.every((value) => value.includes("resolve=1"))).toBe(true);
    expect(resolveUrls.every((value) => !value.includes("proxy=1"))).toBe(true);
  });
});
