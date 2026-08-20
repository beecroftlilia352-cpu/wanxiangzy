import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
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

  it("packages every result into one ZIP download with distinct filenames", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    let archiveBlob: Blob | null = null;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) archiveBlob = blob;
      return "blob:result-archive";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ successCount: 2, failedCount: 0 });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].href).toBe("blob:result-archive");
    expect(downloads[0].filename).toMatch(/^tryon-results-\d{4}-\d{6}\.zip$/);
    expect(archiveBlob).not.toBeNull();
    if (!archiveBlob) throw new Error("ZIP blob was not created");
    const archiveBytes = await readBlobBytes(archiveBlob);
    const files = unzipSync(archiveBytes);
    const stamp = downloads[0].filename.match(/(\d{4}-\d{6})\.zip$/)?.[1];
    expect(stamp).toBeTruthy();
    expect(Object.keys(files)).toEqual([
      `tryon-results-${stamp}-01.webp`,
      `tryon-results-${stamp}-02.jpg`,
    ]);
    expect(Array.from(files[`tryon-results-${stamp}-01.webp`])).toEqual([1, 2, 3]);
    expect(Array.from(files[`tryon-results-${stamp}-02.jpg`])).toEqual([4, 5]);
  });

  it("falls back to the authenticated download route when direct CORS fetch is unavailable", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(new Uint8Array([2]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:result-archive");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await downloadMediaFiles({
      urls: [
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/first.png",
        "https://vasthk.oss-cn-hongkong.aliyuncs.com/results/second.png",
      ],
      filenamePrefix: "results",
    });

    const fallbackUrls = [fetchMock.mock.calls[1][0], fetchMock.mock.calls[3][0]].map(String);
    expect(fallbackUrls.every((value) => value.includes("/api/download-image"))).toBe(true);
    expect(fallbackUrls.every((value) => value.includes("proxy=1"))).toBe(true);
  });
});

function readBlobBytes(blob: Blob) {
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob"));
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(blob);
  });
}
