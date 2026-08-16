import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { MultiImageUploadV2 } from "@/components/studio/MultiImageUploadV2";
import zhMessages from "@/messages/zh.json";

afterEach(() => cleanup());

vi.mock("@/lib/image-variants", () => ({
  getImageVariantUrl: (url: string) => url,
}));

const urls = Array.from({ length: 5 }, (_, index) => `https://example.com/image-${index + 1}.png`);

function renderUploader(overrides: Partial<React.ComponentProps<typeof MultiImageUploadV2>> = {}) {
  const props: React.ComponentProps<typeof MultiImageUploadV2> = {
    urls: [],
    maxCount: 5,
    title: "商品图",
    emptyHint: "多视角商品图",
    description: "上传清晰完整的商品图",
    imageRequirement: "图片小于 10MB",
    onUploadClick: vi.fn(),
    onRemove: vi.fn(),
    onClear: vi.fn(),
    examples: {
      label: "示例",
      images: [{ url: "https://example.com/example.png", title: "示例商品" }],
      onSelect: vi.fn(),
    },
    ...overrides,
  };

  return {
    props,
    ...render(
      <NextIntlClientProvider locale="zh" messages={zhMessages}>
        <MultiImageUploadV2 {...props} />
      </NextIntlClientProvider>,
    ),
  };
}

describe("MultiImageUploadV2", () => {
  it("renders the screenshot empty state with max badge and examples inside the panel", () => {
    const { getByText, container } = renderUploader();

    expect(getByText("商品图")).toBeTruthy();
    expect(getByText("最多 5 张")).toBeTruthy();
    expect(getByText("点击上传 / 或拖拽至此 / 粘贴【多视角商品图】")).toBeTruthy();
    expect(container.querySelector(".studio-multi-image-v2-panel .studio-multi-image-v2-examples")).toBeTruthy();
    expect(container.querySelector(".studio-multi-image-v2-results")).toBeNull();
  });

  it("orders continue upload before tips and uploaded images, and opens preview on click", () => {
    const onPreview = vi.fn();
    const { container, getByText } = renderUploader({
      urls: urls.slice(0, 3),
      onPreview,
    });

    const panel = container.querySelector(".studio-multi-image-v2-panel");
    const tips = container.querySelector(".studio-upload-tile-tips");
    const results = container.querySelector(".studio-multi-image-v2-results");
    expect(panel).toBeTruthy();
    expect(tips).toBeTruthy();
    expect(results).toBeTruthy();
    expect(panel!.compareDocumentPosition(tips!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tips!.compareDocumentPosition(results!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getByText("已上传3/5")).toBeTruthy();
    expect(getByText("继续上传【多视角商品图】")).toBeTruthy();

    fireEvent.click(container.querySelector(".studio-multi-image-v2-preview") as HTMLElement);
    expect(onPreview).toHaveBeenCalledWith(urls[0], 0);
  });

  it("hides the upload panel when the limit is reached", () => {
    const { container, getByText } = renderUploader({ urls });

    expect(container.querySelector(".studio-multi-image-v2-panel")).toBeNull();
    expect(container.querySelectorAll(".studio-multi-image-v2-card")).toHaveLength(5);
    expect(getByText("已上传5/5")).toBeTruthy();
  });

  it("requires the dedicated confirmation dialog before clearing", async () => {
    const onClear = vi.fn();
    const { container, getByText } = renderUploader({ urls: urls.slice(0, 2), onClear });

    fireEvent.click(container.querySelector(".studio-multi-image-v2-clear") as HTMLElement);

    expect(getByText("确认清空？")).toBeTruthy();
    expect(getByText("清空后已上传图片将无法恢复")).toBeTruthy();
    expect(document.querySelector(".studio-batch-clear-dialog")).toBeTruthy();
    expect(onClear).not.toHaveBeenCalled();

    fireEvent.click(getByText("仍要清空"));
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1));
  });
});
