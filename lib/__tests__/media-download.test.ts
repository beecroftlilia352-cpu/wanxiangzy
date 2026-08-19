import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadMediaFile, downloadMediaFiles } from "@/lib/media-download";

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

  it("routes canonical media assets through an authenticated redirect without proxying bytes", async () => {
    let clickedHref = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedHref = this.href;
    });

    await downloadMediaFile(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
      "result.png",
    );

    const downloadUrl = new URL(clickedHref);
    expect(downloadUrl.pathname).toBe(
      "/api/media-assets/123e4567-e89b-12d3-a456-426614174000",
    );
    expect(downloadUrl.searchParams.get("filename")).toBe("result.png");
    expect(downloadUrl.searchParams.get("proxy")).toBeNull();
  });

  it("hands every result directly to the browser with distinct filenames", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 19, 30, 5));

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const downloads: Array<{ href: string; filename: string }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });

    const result = await downloadMediaFiles({
      urls: [
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp",
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.jpg?version=2",
      ],
      filenamePrefix: "tryon-results",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ successCount: 2, failedCount: 0 });
    expect(downloads.map((item) => item.filename)).toEqual([
      "tryon-results-0819-193005-01.webp",
      "tryon-results-0819-193005-02.jpg",
    ]);
    expect(downloads.map((item) => item.href)).toEqual([
      "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.webp",
      "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.jpg?version=2",
    ]);
  });
});
