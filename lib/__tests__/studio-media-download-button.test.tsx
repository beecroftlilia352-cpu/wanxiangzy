import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  StudioBatchDownloadButton,
  StudioSingleDownloadButton,
} from "@/components/studio/StudioMediaDownloadButton";

const mediaMocks = vi.hoisted(() => ({
  downloadMediaFile: vi.fn(),
  downloadMediaFiles: vi.fn(),
}));

vi.mock("@/lib/media-download", () => ({
  downloadMediaFile: mediaMocks.downloadMediaFile,
  downloadMediaFiles: mediaMocks.downloadMediaFiles,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioMediaDownloadButton", () => {
  it("shows an immediate busy state while a single download resolves", async () => {
    let finish!: () => void;
    mediaMocks.downloadMediaFile.mockImplementation(() => new Promise<void>((resolve) => {
      finish = resolve;
    }));

    const { getByRole, container } = render(
      <StudioSingleDownloadButton
        url="https://example.com/result.png"
        filename="result.png"
        label="下载图片"
        errorFallback="下载失败"
      />,
    );
    const button = getByRole("button", { name: "下载图片" });

    fireEvent.click(button);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".animate-spin")).toBeTruthy();

    finish();
    await waitFor(() => expect(button.getAttribute("aria-busy")).toBe("false"));
  });

  it("surfaces multi-file handoff progress in the button label", async () => {
    let finish!: (value: { successCount: number; failedCount: number }) => void;
    mediaMocks.downloadMediaFiles.mockImplementation((options: {
      onProgress?: (progress: {
        phase: "saving";
        completed: number;
        total: number;
        percent: number;
      }) => void;
    }) => {
      options.onProgress?.({ phase: "saving", completed: 1, total: 2, percent: 50 });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });

    const { getByRole, getByText } = render(
      <StudioBatchDownloadButton
        urls={["https://example.com/one.png", "https://example.com/two.png"]}
        filename="results"
        label="打包下载"
        resultLabel="图片"
      />,
    );

    fireEvent.click(getByRole("button", { name: "打包下载" }));
    expect(getByText("1/2")).toBeTruthy();

    finish({ successCount: 2, failedCount: 0 });
    await waitFor(() => expect(getByRole("button", { name: "打包下载" }).getAttribute("aria-busy")).toBe("false"));
  });
});
