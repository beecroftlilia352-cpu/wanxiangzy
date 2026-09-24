import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import zhMessages from "@/messages/zh.json";

/**
 * ResultImageGrid 新增插槽 besideImageExtra 的「只做加法」证据测试。
 *
 * 1) 不传 / 传 null / 传 undefined 时，渲染出的 DOM 与「不传任何新 prop」逐字节一致；
 * 2) 传了节点时，它落在「图片右侧下载按钮」所在的那个 shrink-0 容器内、且排在下载按钮之后，
 *    既有的 dom 结构（beside 按钮的父容器仍是 shrink-0、仍然是该行最后一个子元素）不变。
 */

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

function renderGrid(extra?: React.ReactNode, withExtraProp = true) {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <ResultImageGrid
        variant="task"
        urls={["https://example.com/result-1.jpg"]}
        filenamePrefix="image-to-image"
        statusGroup="completed"
        downloadBesideImage
        // 固定时间戳：组件在未传 createdAt 时会渲染「当前时间」，跨秒会让逐字节比较变成不稳定测试。
        createdAt="2026-09-24T00:00:00.000Z"
        onOpen={vi.fn()}
        {...(withExtraProp ? { besideImageExtra: extra } : {})}
      />
    </NextIntlClientProvider>,
  );
}

describe("ResultImageGrid besideImageExtra 插槽（只做加法）", () => {
  it("不传 prop 与传 null/undefined 渲染结果逐字节一致", () => {
    const withoutProp = renderGrid(undefined, false).container.innerHTML;
    cleanup();
    const withUndefined = renderGrid(undefined, true).container.innerHTML;
    cleanup();
    const withNull = renderGrid(null, true).container.innerHTML;

    expect(withUndefined).toBe(withoutProp);
    expect(withNull).toBe(withoutProp);
    // 插槽区域没有多出任何包裹节点
    expect(withoutProp).not.toContain("mt-2");
  });

  it("传入的节点渲染在下载按钮正下方，且不改动既有下载按钮的结构", () => {
    const { container } = renderGrid(<span data-testid="product-title-slot">商品标题</span>);

    const beside = container.querySelector(".studio-result-beside-download");
    expect(beside).toBeTruthy();

    const extra = container.querySelector('[data-testid="product-title-slot"]');
    expect(extra).toBeTruthy();

    // 与下载按钮同处一个容器（shrink-0），且在它之后（视觉上的正下方）
    const wrapper = beside!.parentElement!;
    expect(wrapper.className).toContain("shrink-0");
    expect(wrapper.contains(extra!)).toBe(true);
    expect(
      beside!.compareDocumentPosition(extra!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // 外层 flex 行的结构未变：下载按钮所在容器仍是最后一个子元素
    const set = container.querySelector(".studio-result-set")!;
    const imageRow = Array.from(set.children).find((el) => el.className.includes("items-start"))!;
    expect(imageRow).toBeTruthy();
    expect(Array.from(imageRow.children).at(-1)).toBe(wrapper);
  });
});
