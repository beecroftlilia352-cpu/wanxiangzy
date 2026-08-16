import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import zhMessages from "@/messages/zh.json";

afterEach(() => {
  cleanup();
});

// Mock the auth/router context
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  setCachedProfileCredits: vi.fn(),
}));

// Mock the image variant helper
vi.mock("@/lib/image-variants", () => ({
  getImageVariantUrl: (url: string) => url,
}));

vi.mock("@/lib/media-download", () => ({
  downloadMediaFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/download-batch", () => ({
  downloadImagesAsZip: vi.fn().mockResolvedValue({ successCount: 3, failedCount: 0 }),
}));

const sampleUrls = [
  "https://example.com/result-1.png",
  "https://example.com/result-2.png",
  "https://example.com/result-3.png",
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ResultImageGrid download button", () => {
  it("renders a download button on each completed card", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    // The new card-level download button uses .studio-result-card-download
    const downloadButtons = document.querySelectorAll(".studio-result-card-download");
    expect(downloadButtons.length).toBe(3);
    expect(document.querySelector(".studio-result-batch-download")).toBeTruthy();
  });

  it("labels each download button with the image alt prefix", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
        imageAltPrefix="翻译结果"
      />
    );
    const downloadButtons = Array.from(
      document.querySelectorAll<HTMLElement>(".studio-result-card-download[aria-label^=\"下载翻译结果\"]")
    );
    expect(downloadButtons.length).toBe(3);
    expect(downloadButtons[0].getAttribute("aria-label")).toBe("下载翻译结果 1");
    expect(downloadButtons[1].getAttribute("aria-label")).toBe("下载翻译结果 2");
    expect(downloadButtons[2].getAttribute("aria-label")).toBe("下载翻译结果 3");
  });

  it("stops propagation so clicking the button does not open the lightbox", () => {
    const onOpen = vi.fn();
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        filenamePrefix="image-translation"
        onOpen={onOpen}
        variant="task"
      />
    );
    const firstDownload = document.querySelector(".studio-result-card-download");
    expect(firstDownload).toBeTruthy();
    fireEvent.click(firstDownload as HTMLElement);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not render the download button when the slot is empty", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={["", "", ""]}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    const downloadButtons = document.querySelectorAll(".studio-result-card-download");
    expect(downloadButtons.length).toBe(0);
  });

  it("uses the standard task variant header (disclaimer + timestamp)", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
        inputReferences={[
          { url: "https://example.com/src-1.png", label: "原图 1" },
          { url: "https://example.com/src-2.png", label: "原图 2" },
        ]}
      />
    );
    expect(document.querySelector(".studio-result-disclaimer")).toBeTruthy();
    expect(document.querySelector(".studio-result-time")).toBeTruthy();
    // The two left-side reference thumbs
    const refThumbs = document.querySelectorAll(".studio-result-reference-thumb");
    expect(refThumbs.length).toBe(2);
  });
});
