import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import zhMessages from "@/messages/zh.json";

/**
 * 「商品标题」按钮 + 弹窗组件单测（纯前端，fetch 全 mock）。
 * 同时校验 i18n 命名空间 ProductTitle 在 zh 文案里存在（按钮/弹窗文案都来自 messages）。
 */

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: toastMocks.success, error: toastMocks.error } }));

import { ProductTitleButton } from "@/features/general-image/product-title-button";

const IMAGE_URL = "http://192.168.31.213:3000/api/media-assets/123e4567-e89b-42d3-a456-426614174000";

const TITLES = [
  { en: "Ceramic Pour-Over Coffee Dripper for Home Brewing", zh: "家用陶瓷手冲咖啡滤杯", angle: "功能卖点" },
  { en: "Minimalist Kitchen Gift for Coffee Lovers", zh: "送给咖啡爱好者的极简厨房礼物", angle: "场景人群" },
  { en: "Matte Glazed Stoneware Dripper 1-2 Cups", zh: "哑光釉面陶瓷滤杯 1-2 人份", angle: "材质规格" },
];

const fetchMock = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

function renderButton() {
  return render(
    <NextIntlClientProvider locale="zh" messages={zhMessages}>
      <ProductTitleButton imageUrl={IMAGE_URL} />
    </NextIntlClientProvider>,
  );
}

function okResponse() {
  return new Response(JSON.stringify({ ok: true, model: "deepseek-flash", titles: TITLES }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProductTitleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async () => okResponse());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("渲染与下载按钮同款的「商品标题」按钮，点击后自动生成并展示 3 条双语标题", async () => {
    renderButton();

    const trigger = screen.getByRole("button", { name: "商品标题" });
    expect(trigger.className).toContain("studio-result-primary-download");
    expect(trigger.className).toContain("studio-result-beside-download");

    fireEvent.click(trigger);

    expect(await screen.findByText("正在看图生成标题…")).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/product-title");
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ imageUrl: IMAGE_URL });

    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(screen.getByText(TITLES[0].zh)).toBeTruthy();
    expect(screen.getByText(TITLES[1].en)).toBeTruthy();
    expect(screen.getByText(TITLES[2].en)).toBeTruthy();
    expect(screen.getByText("共 3 条候选")).toBeTruthy();
    expect(screen.getAllByText(/卖点角度/).length).toBe(3);
  });

  it("每条可复制「英文\\n中文」，复制全部包含三条", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "商品标题" }));
    await screen.findByText(TITLES[0].en);

    fireEvent.click(screen.getAllByRole("button", { name: "复制" })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${TITLES[0].en}\n${TITLES[0].zh}`));
    expect(toastMocks.success).toHaveBeenCalledWith("已复制该标题");

    fireEvent.click(screen.getByRole("button", { name: "复制全部" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      `${TITLES[0].en}\n${TITLES[0].zh}\n\n${TITLES[1].en}\n${TITLES[1].zh}\n\n${TITLES[2].en}\n${TITLES[2].zh}`,
    ));
    expect(toastMocks.success).toHaveBeenCalledWith("已复制全部标题");
  });

  it("失败时显示中文错误与「重试」，重试成功后展示结果", async () => {
    fetchMock.mockImplementationOnce(async () => new Response(
      JSON.stringify({ ok: false, error: "商品标题功能暂不可用：模型控制台里找不到已启用的 DeepSeek 供应商，请联系管理员。", code: "PRODUCT_TITLE_PROVIDER_UNAVAILABLE" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    ));
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "商品标题" }));

    expect(await screen.findByText(/找不到已启用的 DeepSeek 供应商/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("网络异常时给出中文兜底提示", async () => {
    fetchMock.mockImplementationOnce(async () => { throw new Error("offline"); });
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: "商品标题" }));

    expect(await screen.findByText("网络异常，商品标题生成失败，请重试")).toBeTruthy();
  });

  it("关闭弹窗不丢结果，再次打开沿用上次结果（不重复请求）", async () => {
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "商品标题" }));
    await screen.findByText(TITLES[0].en);

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByText(TITLES[0].en)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "商品标题" }));
    expect(await screen.findByText(TITLES[0].en)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
