import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadImagesAsZip } from "@/lib/download-batch";
import { fetchMediaBlob, saveBlobToDevice } from "@/lib/media-download";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/lib/media-download", () => ({
  fetchMediaBlob: vi.fn(),
  saveBlobToDevice: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("downloadImagesAsZip", () => {
  it("packs successful files locally and reports progress", async () => {
    vi.mocked(fetchMediaBlob).mockResolvedValue(new Blob([new Uint8Array([1, 2])], { type: "image/png" }));
    const phases: string[] = [];

    const result = await downloadImagesAsZip({
      urls: ["https://example.com/1.png", "https://example.com/2.png"],
      filename: "results",
      showToast: false,
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(result).toEqual({ successCount: 2, failedCount: 0 });
    expect(fetchMediaBlob).toHaveBeenCalledTimes(2);
    expect(saveBlobToDevice).toHaveBeenCalledOnce();
    expect(phases).toContain("packing");
    expect(phases.at(-1)).toBe("completed");
  });

  it("does not leak a rejected promise to legacy fire-and-forget callers", async () => {
    vi.mocked(fetchMediaBlob).mockRejectedValue(new Error("network down"));

    await expect(downloadImagesAsZip({
      urls: ["https://example.com/1.png"],
    })).resolves.toEqual({ successCount: 0, failedCount: 1 });
  });
});
