import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import zhMessages from "@/messages/zh.json";

const mediaMocks = vi.hoisted(() => ({
  downloadMediaFile: vi.fn().mockResolvedValue(undefined),
  downloadMediaFiles: vi.fn().mockResolvedValue({ successCount: 3, failedCount: 0 }),
  prepareMediaDownloads: vi.fn(async (options: { urls: string[] }) => (
    options.urls.map((url, index) => ({ url, filename: `result-${index + 1}.png` }))
  )),
}));

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
  downloadMediaFile: mediaMocks.downloadMediaFile,
  downloadMediaFiles: mediaMocks.downloadMediaFiles,
  prepareMediaDownloads: mediaMocks.prepareMediaDownloads,
}));

vi.mock("@/hooks/use-resource-favorite", () => ({
  useResourceFavorite: () => ({
    isSaved: false,
    isPending: false,
    isChecking: false,
    toggle: vi.fn().mockResolvedValue(undefined),
  }),
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
  it("renders one batch action plus one hover-dock download per completed image", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    expect(document.querySelectorAll(".studio-result-focus-download")).toHaveLength(sampleUrls.length);
    expect(document.querySelectorAll(".studio-result-primary-download")).toHaveLength(1);
    expect(document.querySelector(".studio-result-batch-download")?.textContent).toContain("下载全部 3 张");
  });

  it("keeps the resource-library action in the card focus dock", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0]]}
        filenamePrefix="general-image"
        onOpen={() => {}}
        statusGroup="completed"
        resourceFavorite={{ generationId: "11111111-1111-4111-8111-111111111111", moduleKey: "generalImage", mediaType: "image" }}
      />
    );

    const favoriteAction = document.querySelector(".studio-result-focus-favorite");
    expect(favoriteAction).toBeTruthy();
    expect(favoriteAction?.textContent).toContain("加入资源库");
  });

  it("uses a single-image action when exactly one result is complete", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0]]}
        expectedCount={1}
        statusGroup="completed"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    expect(document.querySelectorAll(".studio-result-primary-download")).toHaveLength(1);
    expect(document.querySelector(".studio-result-batch-download")).toBeNull();
    expect(document.querySelector(".studio-result-primary-download")?.getAttribute("aria-label")).toBe("下载");
  });

  it("does not expose download-all while generation is still running", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0], "", ""]}
        expectedCount={3}
        isGenerating
        statusGroup="running"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    expect(document.querySelector(".studio-result-primary-download")).toBeNull();
  });

  it("downloads the successful subset when a completed task has missing results", async () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0], "", sampleUrls[2]]}
        expectedCount={3}
        statusGroup="completed"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    await vi.waitFor(() => {
      expect((document.querySelector(".studio-result-batch-download") as HTMLButtonElement).disabled).toBe(false);
    });
    expect(document.querySelector(".studio-result-batch-download")?.textContent).toContain("下载全部 2 张");
    expect(document.querySelectorAll(".studio-result-focus-download")).toHaveLength(2);
  });

  it("keeps successful images downloadable when the overall task is partially failed", async () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0], "", sampleUrls[2], ""]}
        expectedCount={4}
        statusGroup="failed"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    await vi.waitFor(() => {
      expect((document.querySelector(".studio-result-batch-download") as HTMLButtonElement).disabled).toBe(false);
    });
    expect(document.querySelector(".studio-result-batch-download")?.textContent).toContain("下载全部 2 张");
    expect(document.querySelectorAll(".studio-result-focus-download")).toHaveLength(2);
  });

  it("keeps per-card downloads aligned with sparse successful slots", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0], "", sampleUrls[2]]}
        expectedCount={3}
        statusGroup="completed"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );
    const readyCards = document.querySelectorAll(".studio-result-card-ready");
    expect(readyCards).toHaveLength(2);
    expect(readyCards[0].querySelector(".studio-result-focus-download")).toBeTruthy();
    expect(readyCards[1].querySelector(".studio-result-focus-download")).toBeTruthy();
    expect(document.querySelector(".studio-result-card-pending-shell .studio-result-focus-download")).toBeNull();
  });

  it("hands every completed URL to the one batch action", async () => {
    renderWithIntl(
      <ResultImageGrid
        urls={sampleUrls}
        expectedCount={3}
        statusGroup="completed"
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );

    await vi.waitFor(() => {
      expect((document.querySelector(".studio-result-batch-download") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(document.querySelector(".studio-result-batch-download") as HTMLElement);
    expect(mediaMocks.downloadMediaFiles).toHaveBeenCalledWith(expect.objectContaining({
      urls: sampleUrls,
    }));
  });

  it("keeps visual result groups while exposing only one task-wide batch action", async () => {
    renderWithIntl(
      <>
        <ResultImageGrid
          urls={sampleUrls.slice(0, 2)}
          downloadUrls={[...sampleUrls, "https://example.com/result-4.png"]}
          downloadExpectedCount={4}
          expectedCount={2}
          statusGroup="completed"
          filenamePrefix="image-to-image"
          onOpen={() => {}}
          variant="task"
        />
        <ResultImageGrid
          urls={[sampleUrls[2], "https://example.com/result-4.png"]}
          expectedCount={2}
          statusGroup="completed"
          showDownloadAction={false}
          filenamePrefix="image-to-image"
          onOpen={() => {}}
          variant="task"
        />
      </>
    );

    await vi.waitFor(() => {
      expect((document.querySelector(".studio-result-batch-download") as HTMLButtonElement).disabled).toBe(false);
    });
    expect(document.querySelectorAll(".studio-result-batch-download")).toHaveLength(1);
    expect(document.querySelector(".studio-result-batch-download")?.textContent).toContain("下载全部 4 张");
  });

  it("keeps pending cards static while only completed cards receive hover motion", () => {
    renderWithIntl(
      <ResultImageGrid
        urls={["", sampleUrls[0]]}
        expectedCount={2}
        isGenerating
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
      />
    );

    const pendingCard = document.querySelector(".studio-result-card-pending-shell");
    const completedCard = document.querySelector(".studio-result-card-ready");

    expect(pendingCard).toBeTruthy();
    expect(pendingCard?.classList.contains("studio-result-card-pending-shell")).toBe(true);
    expect(pendingCard?.classList.contains("studio-result-card-ready")).toBe(false);
    expect(completedCard).toBeTruthy();
    expect(completedCard?.classList.contains("studio-result-card-ready")).toBe(true);
    expect(completedCard?.classList.contains("studio-result-card-pending-shell")).toBe(false);
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

  it("keeps the decoded image mounted while switching recent tasks", () => {
    const view = renderWithIntl(
      <ResultImageGrid
        urls={[sampleUrls[0]]}
        filenamePrefix="image-translation"
        onOpen={() => {}}
        variant="task"
        renderKey="task-a"
      />
    );
    const initialImage = document.querySelector<HTMLImageElement>(".studio-result-card img");

    expect(initialImage).toBeTruthy();
    expect(initialImage?.getAttribute("src")).toBe(sampleUrls[0]);

    view.rerender(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <ResultImageGrid
          urls={[sampleUrls[1]]}
          filenamePrefix="image-translation"
          onOpen={() => {}}
          variant="task"
          renderKey="task-b"
        />
      </NextIntlClientProvider>
    );

    const imageWhileReplacementDecodes = document.querySelector<HTMLImageElement>(".studio-result-card img");
    expect(imageWhileReplacementDecodes).toBe(initialImage);
    expect(imageWhileReplacementDecodes?.getAttribute("src")).toBe(sampleUrls[0]);
  });
});
