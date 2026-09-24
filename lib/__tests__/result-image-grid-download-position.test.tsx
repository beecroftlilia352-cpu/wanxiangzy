import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import zhMessages from "@/messages/zh.json";

// 结果卡片内部用到 useRouter()（跳转生成记录），测试环境需要提供路由上下文。
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/general-image",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

// 图生图/素材生成页的调用形态：variant="task" + 1 张已完成的结果图。
function renderGrid(overrides: Record<string, unknown> = {}) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <ResultImageGrid
        variant="task"
        urls={["https://example.com/result-1.jpg"]}
        filenamePrefix="image-to-image"
        statusGroup="completed"
        onOpen={vi.fn()}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
}

describe("ResultImageGrid 结果区下载按钮位置", () => {
  it("默认（其他页面）：下载按钮在顶部工具行里", () => {
    const { container } = renderGrid();

    const row = container.querySelector(".studio-result-download-row");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".studio-result-primary-download")).toBeTruthy();
    // 未开启时不应出现"图片旁"的按钮
    expect(container.querySelector(".studio-result-beside-download")).toBeNull();
  });

  it("downloadBesideImage：按钮移出顶部行，落在结果图片右侧且与图片顶部对齐", () => {
    const { container } = renderGrid({ downloadBesideImage: true });

    // 1) 顶部工具行里不再有工具行的下载按钮
    const row = container.querySelector(".studio-result-download-row");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".studio-result-primary-download")).toBeNull();

    // 2) 新位置的按钮存在
    const beside = container.querySelector(".studio-result-beside-download");
    expect(beside).toBeTruthy();

    // 3) 它位于"参考图 + 结果图"那一行里（该行是 items-start = 顶部对齐）
    const set = container.querySelector(".studio-result-set");
    expect(set).toBeTruthy();
    const imageRow = Array.from(set!.children).find((el) =>
      el.className.includes("items-start"),
    );
    expect(imageRow).toBeTruthy();
    expect(imageRow!.contains(beside)).toBe(true);
    expect(imageRow!.className).toContain("items-start");

    // 4) 它排在结果图网格之后（即图片的右侧，而不是左侧或上方）
    const grid = imageRow!.querySelector(".grid");
    expect(grid).toBeTruthy();
    const besideWrapper = beside!.parentElement!;
    const order = Array.from(imageRow!.children);
    expect(order.indexOf(grid as Element)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(besideWrapper)).toBeGreaterThan(
      order.indexOf(grid as Element),
    );
    expect(order[order.length - 1]).toBe(besideWrapper);

    // 5) 外层容器不压缩它（shrink-0），宽度自适应
    expect(besideWrapper.className).toContain("shrink-0");
  });

  it("多张结果时，新位置用的是批量下载按钮", () => {
    const { container } = renderGrid({
      downloadBesideImage: true,
      urls: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      expectedCount: 2,
    });

    const beside = container.querySelector(".studio-result-beside-download");
    expect(beside).toBeTruthy();
    expect(beside!.className).toContain("studio-result-batch-download");
    expect(container.querySelector(".studio-result-download-row .studio-result-primary-download")).toBeNull();
  });
});
